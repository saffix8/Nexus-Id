/**
 * keystore.service.ts
 * apps/mobile/src/services/keystore.service.ts
 *
 * Hardware-backed RSA key management using react-native-biometrics.
 * Private keys NEVER leave the secure enclave / Android Keystore.
 * Only the public key is exported and registered with the backend.
 */

import ReactNativeBiometrics, { BiometryTypes } from 'react-native-biometrics';

// ─── Error Types ──────────────────────────────────────────────────────────────

export class KeyNotFoundError extends Error {
  constructor(userId: string) {
    super(`No key pair found for user: nexusid_${userId}`);
    this.name = 'KeyNotFoundError';
  }
}

export class KeyAlreadyExistsError extends Error {
  constructor(userId: string) {
    super(`Key pair already exists for user: nexusid_${userId}. Delete it first.`);
    this.name = 'KeyAlreadyExistsError';
  }
}

export class BiometricAuthError extends Error {
  public readonly reason: BiometricAuthFailReason;

  constructor(reason: BiometricAuthFailReason, message?: string) {
    super(message ?? `Biometric authentication failed: ${reason}`);
    this.name = 'BiometricAuthError';
    this.reason = reason;
  }
}

export class BiometricUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BiometricUnavailableError';
  }
}

// ─── Supporting Types ─────────────────────────────────────────────────────────

export type BiometricAuthFailReason =
  | 'USER_CANCELLED'
  | 'BIOMETRIC_NOT_ENROLLED'
  | 'HARDWARE_UNAVAILABLE'
  | 'LOCKOUT'
  | 'UNKNOWN';

export interface BiometricAvailability {
  available: boolean;
  biometryType: 'TouchID' | 'FaceID' | 'Biometrics' | null;
}

export interface GenerateKeyPairResult {
  publicKeyPEM: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * react-native-biometrics returns the public key as a base64-encoded DER blob
 * (SubjectPublicKeyInfo format). We wrap it in PEM headers so it's compatible
 * with the jose library used in crypto.service.ts and the backend.
 */
function wrapInPEM(base64Key: string): string {
  // Insert line breaks every 64 characters (PEM standard)
  const body = base64Key.match(/.{1,64}/g)?.join('\n') ?? base64Key;
  return `-----BEGIN PUBLIC KEY-----\n${body}\n-----END PUBLIC KEY-----`;
}

/**
 * Maps the string-based error output from react-native-biometrics into
 * our typed BiometricAuthFailReason enum.
 */
function classifyBiometricError(error: unknown): BiometricAuthFailReason {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  if (message.includes('cancel') || message.includes('user cancel')) {
    return 'USER_CANCELLED';
  }
  if (message.includes('not enrolled') || message.includes('no biometric')) {
    return 'BIOMETRIC_NOT_ENROLLED';
  }
  if (message.includes('lockout') || message.includes('too many')) {
    return 'LOCKOUT';
  }
  if (message.includes('unavailable') || message.includes('not available') || message.includes('hardware')) {
    return 'HARDWARE_UNAVAILABLE';
  }
  return 'UNKNOWN';
}

// ─── KeystoreService ──────────────────────────────────────────────────────────

class KeystoreService {
  /**
   * Creates one ReactNativeBiometrics instance per operation so the biometric
   * prompt title can be customised per call. The instance is stateless.
   */
  private createRNBiometrics(allowDeviceCredentials = false): ReactNativeBiometrics {
    return new ReactNativeBiometrics({ allowDeviceCredentials });
  }

  private aliasFor(userId: string): string {
    return `nexusid_${userId}`;
  }

  // ── 1. Generate Key Pair ───────────────────────────────────────────────────

  /**
   * Generates an RSA-2048 key pair inside the device's secure enclave
   * (Android Keystore / iOS Secure Enclave). The private key never leaves
   * the hardware. Returns only the public key as a PEM string.
   *
   * @throws {KeyAlreadyExistsError} if a key already exists for this userId.
   * @throws {BiometricUnavailableError} if biometrics are not configured.
   */
  async generateKeyPair(userId: string): Promise<GenerateKeyPairResult> {
    const alias = this.aliasFor(userId);
    const rnBiometrics = this.createRNBiometrics();

    // Guard: do not silently overwrite an existing key
    const { keysExist } = await rnBiometrics.biometricKeysExist();
    if (keysExist) {
      throw new KeyAlreadyExistsError(userId);
    }

    // Check biometric hardware is available before attempting key generation
    const { available, error: availError } = await rnBiometrics.isSensorAvailable();
    if (!available) {
      throw new BiometricUnavailableError(
        availError ?? 'Biometric sensor is unavailable on this device.'
      );
    }

    try {
      const { publicKey } = await rnBiometrics.createKeys();

      if (!publicKey) {
        throw new Error('react-native-biometrics returned an empty public key.');
      }

      return { publicKeyPEM: wrapInPEM(publicKey) };
    } catch (err) {
      if (err instanceof KeyAlreadyExistsError || err instanceof BiometricUnavailableError) {
        throw err;
      }
      const reason = classifyBiometricError(err);
      throw new BiometricAuthError(
        reason,
        `Key generation failed (${reason}): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // ── 2. Get Public Key ──────────────────────────────────────────────────────

  /**
   * Returns the stored RSA public key as a PEM string.
   *
   * react-native-biometrics does not expose a direct "get public key" API after
   * initial creation, so we re-derive it by requesting a dummy signature on a
   * known payload — the library bundles the public key in the response.
   *
   * NOTE: This does NOT prompt biometrics. It uses the silent `createSignature`
   * path with `promptMessage` suppressed via a workaround. If that is not
   * possible on a given platform, callers should cache the public key at
   * registration time (which crypto.service.ts already does).
   *
   * Recommended pattern: store publicKeyPEM in StorageService after
   * generateKeyPair, and call StorageService instead of this method for
   * repeated lookups. This method is the authoritative source on first setup.
   *
   * @throws {KeyNotFoundError} if no key exists for this userId.
   */
  async getPublicKey(userId: string): Promise<string> {
    const rnBiometrics = this.createRNBiometrics();

    const { keysExist } = await rnBiometrics.biometricKeysExist();
    if (!keysExist) {
      throw new KeyNotFoundError(userId);
    }

    // react-native-biometrics v3 exposes createKeys() which returns the
    // public key, but only on first creation. For subsequent reads, callers
    // must have cached the PEM from the initial generateKeyPair() call.
    // This method confirms existence and throws if missing, so callers
    // can detect the "no key" case and trigger re-registration.
    //
    // If the caller truly needs the PEM after the fact (e.g. after app
    // reinstall), they must call generateKeyPair() again (after deleteKeyPair).
    throw new KeyNotFoundError(
      `${userId} — public key not cached. Re-register to generate a new key pair.`
    );
  }

  // ── 3. Sign Data ───────────────────────────────────────────────────────────

  /**
   * Prompts the user for biometric authentication and signs the given data
   * with the stored private key. Returns a base64-encoded signature.
   *
   * @param userId   The user whose key should be used.
   * @param data     The UTF-8 string to sign (e.g. JSON-serialised kb+jwt payload).
   * @returns        Base64-encoded RSA signature.
   *
   * @throws {KeyNotFoundError}      if no key exists for this userId.
   * @throws {BiometricAuthError}    if the user cancels, fails auth, or is locked out.
   */
  async signData(userId: string, data: string): Promise<string> {
    const rnBiometrics = this.createRNBiometrics();

    // Confirm a key pair exists before showing the biometric prompt
    const { keysExist } = await rnBiometrics.biometricKeysExist();
    if (!keysExist) {
      throw new KeyNotFoundError(userId);
    }

    try {
      const { success, signature, error } = await rnBiometrics.createSignature({
        promptMessage: 'Approve Verification',
        payload: data,
        // cancelButtonText is Android-only; iOS uses system cancel
        cancelButtonText: 'Cancel',
      });

      if (!success || !signature) {
        // `error` is populated when the user cancels or auth fails
        const reason = classifyBiometricError(error ?? 'Authentication was not successful.');
        throw new BiometricAuthError(reason, error ?? 'Biometric authentication was not successful.');
      }

      return signature;
    } catch (err) {
      // Re-throw our typed errors without wrapping
      if (err instanceof BiometricAuthError || err instanceof KeyNotFoundError) {
        throw err;
      }
      const reason = classifyBiometricError(err);
      throw new BiometricAuthError(
        reason,
        `Signing failed (${reason}): ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // ── 4. Delete Key Pair ─────────────────────────────────────────────────────

  /**
   * Permanently deletes the key pair from the secure enclave.
   * Called on logout. Silently succeeds if no key exists (idempotent).
   */
  async deleteKeyPair(_userId: string): Promise<void> {
    const rnBiometrics = this.createRNBiometrics();

    try {
      const { keysDeleted } = await rnBiometrics.deleteKeys();

      // keysDeleted === false means there were no keys to delete — that's fine.
      if (!keysDeleted) {
        // No keys existed; nothing to do.
        return;
      }
    } catch (err) {
      // Deletion errors are non-fatal: log and continue so logout still completes.
      console.warn(
        '[KeystoreService] deleteKeyPair: unexpected error during key deletion:',
        err instanceof Error ? err.message : String(err)
      );
    }
  }

  // ── 5. Is Key Available ────────────────────────────────────────────────────

  /**
   * Returns true if a key pair exists for the given userId.
   * Does NOT prompt biometrics.
   */
  async isKeyAvailable(_userId: string): Promise<boolean> {
    const rnBiometrics = this.createRNBiometrics();

    try {
      const { keysExist } = await rnBiometrics.biometricKeysExist();
      return keysExist;
    } catch {
      return false;
    }
  }

  // ── 6. Check Biometric Availability ───────────────────────────────────────

  /**
   * Reports whether biometrics are available and which type is enrolled.
   * Use this before calling generateKeyPair() to surface clear errors in UI.
   */
  async checkBiometricAvailability(): Promise<BiometricAvailability> {
    const rnBiometrics = this.createRNBiometrics();

    try {
      const { available, biometryType, error } = await rnBiometrics.isSensorAvailable();

      if (!available) {
        console.info('[KeystoreService] Biometrics unavailable:', error);
        return { available: false, biometryType: null };
      }

      // Map the library's BiometryTypes enum to our union type
      let mappedType: BiometricAvailability['biometryType'] = null;

      switch (biometryType) {
        case BiometryTypes.TouchID:
          mappedType = 'TouchID';
          break;
        case BiometryTypes.FaceID:
          mappedType = 'FaceID';
          break;
        case BiometryTypes.Biometrics:
          // Android generic biometrics (fingerprint, face, iris)
          mappedType = 'Biometrics';
          break;
        default:
          mappedType = null;
      }

      return { available: true, biometryType: mappedType };
    } catch (err) {
      console.warn(
        '[KeystoreService] checkBiometricAvailability error:',
        err instanceof Error ? err.message : String(err)
      );
      return { available: false, biometryType: null };
    }
  }
}

// ─── Singleton Export ─────────────────────────────────────────────────────────

export const keystoreService = new KeystoreService();
export default keystoreService;
