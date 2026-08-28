// apps/mobile/src/services/notification.service.ts

import messaging, {
  FirebaseMessagingTypes,
} from '@react-native-firebase/messaging';
import { Platform, PermissionsAndroid } from 'react-native';
import { NavigationProp } from '@react-navigation/native';
import { StorageService } from './storage.service';

// ─── Types ───────────────────────────────────────────────────────────────────

interface VerificationRequestPayload {
  type: 'VERIFICATION_REQUEST';
  verification_request_id: string;
  verifier_id: string;
  verifier_name: string;
  requested_fields: string; // JSON string
  nonce: string;
  expires_at: string;
}

interface ParsedVerificationRequest {
  verification_request_id: string;
  verifier_id: string;
  verifier_name: string;
  requested_fields: string[];
  nonce: string;
  expires_at: string;
}

type RootStackParamList = {
  VerificationApprovalScreen: {
    verification_request_id: string;
  };
  [key: string]: object | undefined;
};

// ─── Errors ──────────────────────────────────────────────────────────────────

export class NotificationPermissionDeniedError extends Error {
  constructor() {
    super('Notification permission was denied by the user');
    this.name = 'NotificationPermissionDeniedError';
  }
}

export class InvalidPayloadError extends Error {
  constructor(message: string) {
    super(`Invalid notification payload: ${message}`);
    this.name = 'InvalidPayloadError';
  }
}

export class FCMTokenError extends Error {
  constructor(message: string) {
    super(`Failed to get FCM token: ${message}`);
    this.name = 'FCMTokenError';
  }
}

// ─── Android Notification Channel ────────────────────────────────────────────

const VERIFICATION_CHANNEL_ID = 'verification_requests';
const VERIFICATION_CHANNEL_NAME = 'Verification Requests';

// ─── MobileNotificationService ───────────────────────────────────────────────

class MobileNotificationService {
  private navigation: NavigationProp<RootStackParamList> | null = null;
  private isAppInForeground = true;
  private unsubscribeForeground: (() => void) | null = null;
  private unsubscribeOpenedApp: (() => void) | null = null;
  private unsubscribeTokenRefresh: (() => void) | null = null;
  private initialized = false;

  // ── initialize ─────────────────────────────────────────────────────────────

  async initialize(
    navigation: NavigationProp<RootStackParamList>,
  ): Promise<string> {
    if (this.initialized) {
      console.warn('[NotificationService] Already initialized — skipping');
      return this.getFCMToken();
    }

    this.navigation = navigation;
    this.initialized = true;

    // 1. Request permissions (iOS requires explicit request; Android 13+ too)
    await this.requestPermissions();

    // 2. Create Android notification channel
    if (Platform.OS === 'android') {
      await this.createAndroidChannel();
    }

    // 3. Register handlers
    this.registerForegroundHandler();
    this.registerBackgroundHandler();
    this.registerOpenedAppHandler();

    // 4. Handle the case where the app was launched from a notification (quit state)
    await this.handleInitialNotification();

    // 5. Get and return FCM token
    const token = await this.getFCMToken();
    console.info('[NotificationService] Initialized. FCM token obtained.');
    return token;
  }

  // ── requestPermissions ─────────────────────────────────────────────────────

  private async requestPermissions(): Promise<void> {
    if (Platform.OS === 'ios') {
      const authStatus = await messaging().requestPermission({
        alert: true,
        badge: true,
        sound: true,
        announcement: false,
        carPlay: false,
        criticalAlert: false,
        provisional: false,
      });

      const granted =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED ||
        authStatus === messaging.AuthorizationStatus.PROVISIONAL;

      if (!granted) {
        throw new NotificationPermissionDeniedError();
      }
    }

    if (Platform.OS === 'android' && Platform.Version >= 33) {
      const granted = await PermissionsAndroid.request(
        PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS,
      );
      if (granted !== PermissionsAndroid.RESULTS.GRANTED) {
        throw new NotificationPermissionDeniedError();
      }
    }
  }

  // ── createAndroidChannel ───────────────────────────────────────────────────

  private async createAndroidChannel(): Promise<void> {
    try {
      // react-native-firebase v18+ auto-creates channels via google-services.json
      // but we can ensure it exists by using the native module directly if needed.
      // For most setups, the channel is declared in AndroidManifest.xml or here:
      const { default: notifee } = await import('@notifee/react-native').catch(
        () => ({ default: null }),
      );

      if (notifee) {
        await notifee.createChannel({
          id: VERIFICATION_CHANNEL_ID,
          name: VERIFICATION_CHANNEL_NAME,
          importance: 4, // AndroidImportance.HIGH
          vibration: true,
          sound: 'default',
        });
      }
      // If notifee isn't installed, channels still work via Firebase defaults.
    } catch (err) {
      // Non-fatal: FCM will use default channel
      console.warn('[NotificationService] Could not create Android channel:', err);
    }
  }

  // ── Foreground handler ─────────────────────────────────────────────────────

  private registerForegroundHandler(): void {
    // Clean up previous listener if re-registering
    this.unsubscribeForeground?.();

    this.unsubscribeForeground = messaging().onMessage(
      async (remoteMessage: FirebaseMessagingTypes.RemoteMessage) => {
        console.info('[NotificationService] Foreground message received');
        this.isAppInForeground = true;

        if (remoteMessage.data?.type === 'VERIFICATION_REQUEST') {
          await this.handleVerificationRequest(remoteMessage);
        }
      },
    );
  }

  // ── Background handler ─────────────────────────────────────────────────────

  private registerBackgroundHandler(): void {
    // Background handler must be registered outside of a component lifecycle
    // and is a module-level call. We call it here but it persists globally.
    messaging().setBackgroundMessageHandler(
      async (remoteMessage: FirebaseMessagingTypes.RemoteMessage) => {
        console.info('[NotificationService] Background message received');
        this.isAppInForeground = false;

        if (remoteMessage.data?.type === 'VERIFICATION_REQUEST') {
          await this.handleVerificationRequest(remoteMessage);
        }
      },
    );
  }

  // ── Opened-app handler (notification tap from background) ─────────────────

  private registerOpenedAppHandler(): void {
    this.unsubscribeOpenedApp?.();

    this.unsubscribeOpenedApp = messaging().onNotificationOpenedApp(
      async (remoteMessage: FirebaseMessagingTypes.RemoteMessage) => {
        console.info('[NotificationService] Notification tapped (background→foreground)');

        if (remoteMessage.data?.type === 'VERIFICATION_REQUEST') {
          const parsed = this.parsePayload(remoteMessage.data);
          this.navigateToApprovalScreen(parsed.verification_request_id);
        }
      },
    );
  }

  // ── Handle quit-state (app launched from notification) ────────────────────

  private async handleInitialNotification(): Promise<void> {
    const remoteMessage = await messaging().getInitialNotification();

    if (remoteMessage?.data?.type === 'VERIFICATION_REQUEST') {
      console.info('[NotificationService] App opened from quit state via notification');
      const parsed = this.parsePayload(remoteMessage.data);
      // Delay navigation slightly to let the navigation stack mount
      setTimeout(() => {
        this.navigateToApprovalScreen(parsed.verification_request_id);
      }, 500);
    }
  }

  // ── handleVerificationRequest ──────────────────────────────────────────────

  private async handleVerificationRequest(
    remoteMessage: FirebaseMessagingTypes.RemoteMessage,
  ): Promise<void> {
    if (!remoteMessage.data) {
      console.warn('[NotificationService] Received message with no data payload');
      return;
    }

    let parsed: ParsedVerificationRequest;
    try {
      parsed = this.parsePayload(remoteMessage.data);
    } catch (err) {
      console.error('[NotificationService] Failed to parse payload:', err);
      return;
    }

    // Validate not already expired
    if (new Date(parsed.expires_at) < new Date()) {
      console.warn(
        '[NotificationService] Received expired verification request — ignoring:',
        parsed.verification_request_id,
      );
      return;
    }

    // Persist to local DB so VerificationApprovalScreen can load it
    try {
      await StorageService.savePendingVerification({
        id: parsed.verification_request_id,
        verifier_id: parsed.verifier_id,
        verifier_name: parsed.verifier_name,
        requested_fields: JSON.stringify(parsed.requested_fields),
        nonce: parsed.nonce,
        expires_at: parsed.expires_at,
        status: 'pending',
        received_at: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[NotificationService] Failed to persist pending verification:', err);
      // Continue — user can still navigate, StorageService errors are non-fatal here
    }

    if (this.isAppInForeground) {
      // Navigate directly — app is visible
      this.navigateToApprovalScreen(parsed.verification_request_id);
    }
    // Background/quit: Firebase will show the system notification automatically
    // because the message has a `notification` block set by the server.
    // Tapping it triggers onNotificationOpenedApp or getInitialNotification.
  }

  // ── parsePayload ───────────────────────────────────────────────────────────

  private parsePayload(
    data: Record<string, string>,
  ): ParsedVerificationRequest {
    const {
      verification_request_id,
      verifier_id,
      verifier_name,
      requested_fields,
      nonce,
      expires_at,
    } = data as Partial<VerificationRequestPayload>;

    if (!verification_request_id) throw new InvalidPayloadError('missing verification_request_id');
    if (!verifier_id)             throw new InvalidPayloadError('missing verifier_id');
    if (!verifier_name)           throw new InvalidPayloadError('missing verifier_name');
    if (!requested_fields)        throw new InvalidPayloadError('missing requested_fields');
    if (!nonce)                   throw new InvalidPayloadError('missing nonce');
    if (!expires_at)              throw new InvalidPayloadError('missing expires_at');

    let parsedFields: string[];
    try {
      parsedFields = JSON.parse(requested_fields);
      if (!Array.isArray(parsedFields)) throw new Error('not an array');
    } catch {
      throw new InvalidPayloadError('requested_fields is not valid JSON array');
    }

    return {
      verification_request_id,
      verifier_id,
      verifier_name,
      requested_fields: parsedFields,
      nonce,
      expires_at,
    };
  }

  // ── navigateToApprovalScreen ───────────────────────────────────────────────

  private navigateToApprovalScreen(verificationRequestId: string): void {
    if (!this.navigation) {
      console.warn('[NotificationService] Navigation ref not set — cannot navigate');
      return;
    }

    try {
      this.navigation.navigate('VerificationApprovalScreen', {
        verification_request_id: verificationRequestId,
      });
    } catch (err) {
      console.error('[NotificationService] Navigation failed:', err);
    }
  }

  // ── getFCMToken ────────────────────────────────────────────────────────────

  async getFCMToken(): Promise<string> {
    try {
      // Check if token is registered; getToken() returns existing or new token
      const token = await messaging().getToken();
      if (!token) {
        throw new FCMTokenError('getToken() returned empty string');
      }
      return token;
    } catch (err) {
      if (err instanceof FCMTokenError) throw err;
      throw new FCMTokenError(
        err instanceof Error ? err.message : 'Unknown error',
      );
    }
  }

  // ── onTokenRefresh ─────────────────────────────────────────────────────────

  onTokenRefresh(callback: (token: string) => void): void {
    // Clean up previous subscription
    this.unsubscribeTokenRefresh?.();

    this.unsubscribeTokenRefresh = messaging().onTokenRefresh(
      (newToken: string) => {
        console.info('[NotificationService] FCM token refreshed');
        callback(newToken);
      },
    );
  }

  // ── setForegroundState ─────────────────────────────────────────────────────
  // Call this from AppState listener in your root component

  setForegroundState(isForeground: boolean): void {
    this.isAppInForeground = isForeground;
  }

  // ── destroy ────────────────────────────────────────────────────────────────

  destroy(): void {
    this.unsubscribeForeground?.();
    this.unsubscribeOpenedApp?.();
    this.unsubscribeTokenRefresh?.();
    this.navigation = null;
    this.initialized = false;
  }
}

// ─── Singleton export ─────────────────────────────────────────────────────────

export const notificationService = new MobileNotificationService();
export default notificationService;