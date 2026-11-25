// In-app authentication (FR-015). A plain biometric/device-credential check —
// it does not touch the Keystore signing key (that stays in keystore.service.ts).
import ReactNativeBiometrics from 'react-native-biometrics';

export type BiometricResult = { ok: true } | { ok: false; reason: 'cancelled' | 'unavailable' | 'failed'; message: string };

const rnb = new ReactNativeBiometrics({ allowDeviceCredentials: true });

export async function authenticate(promptMessage: string): Promise<BiometricResult> {
  try {
    const { available } = await rnb.isSensorAvailable();
    if (!available) {
      return { ok: false, reason: 'unavailable', message: 'Set up a fingerprint or screen lock in Android settings to use NexusID.' };
    }
    const { success, error } = await rnb.simplePrompt({ promptMessage, cancelButtonText: 'Cancel' });
    if (success) return { ok: true };
    const cancelled = !error || /cancel/i.test(error);
    return { ok: false, reason: cancelled ? 'cancelled' : 'failed', message: cancelled ? 'Authentication cancelled.' : error };
  } catch (err) {
    return { ok: false, reason: 'failed', message: err instanceof Error ? err.message : 'Authentication failed.' };
  }
}
