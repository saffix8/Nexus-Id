import * as admin from 'firebase-admin';
import type { Message, MulticastMessage } from 'firebase-admin/messaging';
import { getMessaging } from 'firebase-admin/messaging';
import prisma from '../lib/prisma.js';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SendVerificationRequestParams {
  push_token: string;
  verification_request_id: string;
  verifier_id: string;
  verifier_name: string;
  requested_fields: string[];
  nonce: string;
  expires_at: string;
}

interface SendResult {
  success: boolean;
  message_id?: string;
  error?: string;
}

interface BatchResult {
  success: number;
  failure: number;
}

// ─── FCM error codes that indicate a stale / invalid token ───────────────────
const STALE_TOKEN_CODES = new Set([
  'messaging/invalid-registration-token',
  'messaging/registration-token-not-registered',
  'messaging/invalid-argument',
]);

// ─── NotificationService ──────────────────────────────────────────────────────

class NotificationService {
  private initialized = false;

  /**
   * Initialize the Firebase Admin SDK.
   * Safe to call multiple times — guards against double-initialization.
   * Call once at app startup (src/index.ts).
   */
  initialize(): void {
    if (this.initialized || admin.apps.length > 0) {
      this.initialized = true;
      return;
    }

    const projectId = process.env.FIREBASE_PROJECT_ID;
    const privateKey = process.env.FIREBASE_PRIVATE_KEY;
    const clientEmail = process.env.FIREBASE_CLIENT_EMAIL;

    if (!projectId || !privateKey || !clientEmail) {
  console.warn(
    '[NotificationService] Firebase credentials not configured. ' +
    'Push notifications are disabled.',
  );
  this.initialized = true;
  return;
}

    admin.initializeApp({
      credential: admin.credential.cert({
        projectId,
        // Cloud Run / Railway inject \n literally — unescape it
        privateKey: privateKey.replace(/\\n/g, '\n'),
        clientEmail,
      }),
    });

    this.initialized = true;
    console.info('[NotificationService] Firebase Admin SDK initialized.');
  }

  // ── Private helpers ────────────────────────────────────────────────────────

  private get messaging() {
    if (!this.initialized) {
      throw new Error('[NotificationService] Call initialize() before sending notifications.');
    }
    return getMessaging();
  }

  /**
   * Removes a stale FCM push token from the users table so we stop
   * attempting to deliver to a device that has uninstalled the app or
   * rotated its token.
   */
  private async removeStalePushToken(token: string): Promise<void> {
    try {
      await prisma.user.updateMany({
        where: { pushToken: token },
        data: { pushToken: null },
      });
      console.warn(`[NotificationService] Removed stale push token (${token.slice(0, 12)}…)`);
    } catch (err) {
      // Non-critical — log and continue
      console.error('[NotificationService] Failed to remove stale push token:', err);
    }
  }

  private isStaleTokenError(code: string): boolean {
    return STALE_TOKEN_CODES.has(code);
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  /**
   * Send a verification request push notification to a single device.
   *
   * Automatically removes the token from the DB if Firebase reports it
   * as invalid / unregistered.
   */
  async sendVerificationRequest(params: SendVerificationRequestParams): Promise<SendResult> {
    const {
      push_token,
      verification_request_id,
      verifier_id,
      verifier_name,
      requested_fields,
      nonce,
      expires_at,
    } = params;

    const message: Message = {
      token: push_token,

      notification: {
        title: 'Verification Request',
        body: `${verifier_name} wants to verify: ${requested_fields.join(', ')}`,
      },

      // All data values must be strings for FCM
      data: {
        type: 'VERIFICATION_REQUEST',
        verification_request_id,
        verifier_id,
        verifier_name,
        requested_fields: JSON.stringify(requested_fields),
        nonce,
        expires_at,
      },

      android: {
        priority: 'high',
        notification: {
          channelId: 'verification_requests',
          priority: 'max',
          defaultSound: true,
          defaultVibrateTimings: true,
        },
      },

      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            contentAvailable: true,
          },
        },
        headers: {
          'apns-priority': '10',
          'apns-push-type': 'alert',
        },
      },
    };

    try {
      const messageId = await this.messaging.send(message);
      return { success: true, message_id: messageId };
    } catch (err: unknown) {
      const fcmErr = err as admin.FirebaseError;
      const code: string = fcmErr?.code ?? 'unknown';
      const errorMessage: string = fcmErr?.message ?? 'Unknown FCM error';

      console.error(`[NotificationService] sendVerificationRequest failed (${code}):`, errorMessage);

      if (this.isStaleTokenError(code)) {
        await this.removeStalePushToken(push_token);
        return {
          success: false,
          error: `Stale token removed. Code: ${code}`,
        };
      }

      return { success: false, error: `${code}: ${errorMessage}` };
    }
  }

  /**
   * Notify the user that their verification was received and processed.
   * Fire-and-forget from the caller's perspective (errors are logged, not thrown).
   */
  async sendVerificationComplete(push_token: string, request_id: string): Promise<void> {
    const message: Message = {
      token: push_token,

      notification: {
        title: 'Verification Complete',
        body: 'Your identity was verified successfully.',
      },

      data: {
        type: 'VERIFICATION_COMPLETE',
        verification_request_id: request_id,
      },

      android: {
        priority: 'normal',
        notification: {
          channelId: 'verification_requests',
        },
      },

      apns: {
        payload: {
          aps: { sound: 'default' },
        },
      },
    };

    try {
      await this.messaging.send(message);
    } catch (err: unknown) {
      const fcmErr = err as admin.FirebaseError;
      const code: string = fcmErr?.code ?? 'unknown';

      console.error(`[NotificationService] sendVerificationComplete failed (${code}):`, fcmErr?.message);

      if (this.isStaleTokenError(code)) {
        await this.removeStalePushToken(push_token);
      }
      // Do not rethrow — completing the verification is more important than the notification
    }
  }

  /**
   * Send the same data payload to multiple devices.
   * Uses sendEachForMulticast for per-token error handling.
   *
   * Stale tokens are cleaned up automatically.
   * Returns counts of successes and failures.
   */
  async sendBatchNotifications(
    tokens: string[],
    payload: Record<string, string>,
  ): Promise<BatchResult> {
    if (tokens.length === 0) return { success: 0, failure: 0 };

    // FCM multicast max is 500 tokens per call
    const CHUNK_SIZE = 500;
    let totalSuccess = 0;
    let totalFailure = 0;

    for (let i = 0; i < tokens.length; i += CHUNK_SIZE) {
      const chunk = tokens.slice(i, i + CHUNK_SIZE);

      const message: MulticastMessage = {
        tokens: chunk,
        data: payload,
        android: { priority: 'high' },
        apns: { headers: { 'apns-priority': '10' } },
      };

      try {
        const batchResponse = await this.messaging.sendEachForMulticast(message);

        totalSuccess += batchResponse.successCount;
        totalFailure += batchResponse.failureCount;

        // Clean up stale tokens from this batch
        const stalePurges: Promise<void>[] = [];

        batchResponse.responses.forEach((resp, idx) => {
          if (!resp.success) {
            const code = resp.error?.code ?? 'unknown';
            console.warn(
              `[NotificationService] Batch send failed for token[${i + idx}]: ${code}`,
            );
            if (this.isStaleTokenError(code)) {
              stalePurges.push(this.removeStalePushToken(chunk[idx]));
            }
          }
        });

        // Run stale token cleanups in parallel, don't block the return
        await Promise.allSettled(stalePurges);
      } catch (err: unknown) {
        const fcmErr = err as admin.FirebaseError;
        console.error('[NotificationService] sendBatchNotifications chunk error:', fcmErr?.message);
        totalFailure += chunk.length;
      }
    }

    return { success: totalSuccess, failure: totalFailure };
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────
export const notificationService = new NotificationService();
