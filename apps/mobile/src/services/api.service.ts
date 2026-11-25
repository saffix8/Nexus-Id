import axios, {
  AxiosInstance,
  AxiosRequestConfig,
  AxiosError,
  InternalAxiosRequestConfig,
} from 'axios';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { EventEmitter } from 'eventemitter3';
import type {
  ApiResponse,
  SDJWTCredential,
  Proof,
  VerificationResult,
  VerificationRequest,
} from '@nexusid/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_URL = (process.env.API_URL ?? 'http://10.0.2.2:4000/api/v1').replace(
  /\/$/,
  '',
);

const TOKEN_STORAGE_KEY = '@nexusid/jwt_token';

// ─── Typed Errors ─────────────────────────────────────────────────────────────

export class NetworkError extends Error {
  readonly code: string;
  readonly statusCode?: number;

  constructor(message: string, code: string, statusCode?: number) {
    super(message);
    this.name = 'NetworkError';
    this.code = code;
    this.statusCode = statusCode;
  }
}

export class AuthError extends Error {
  constructor(message = 'Authentication failed. Please log in again.') {
    super(message);
    this.name = 'AuthError';
  }
}

export class ApiError extends Error {
  readonly statusCode: number;
  readonly serverMessage: string;

  constructor(message: string, statusCode: number) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.serverMessage = message;
  }
}

// ─── Event Bus (logout signal) ────────────────────────────────────────────────

type ApiEvents = {
  logout: [];
};

export const apiEvents = new EventEmitter<ApiEvents>();

// ─── Register Params Type ─────────────────────────────────────────────────────

interface RegisterParams {
  user_id: string;
  public_key: string;
  push_token: string;
  device_info: Record<string, unknown>;
}

interface LoginParams {
  user_id: string;
  signature: string;
  challenge: string;
}

interface LoginResponseData {
  token: string;
  expires_at: string;
}

interface RegisterResponseData {
  user_id: string;
  registered_at: string;
}

interface IssuerPublicKeyData {
  public_key: string;
}

// ─── ApiService ───────────────────────────────────────────────────────────────

class ApiService {
  private readonly client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: BASE_URL,
      timeout: 15_000,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
    });

    // Request interceptor — attach JWT
    this.client.interceptors.request.use(
      async (config: InternalAxiosRequestConfig) => {
        const token = await this.getToken();
        if (token) {
          config.headers.Authorization = `Bearer ${token}`;
        }
        return config;
      },
      (error: unknown) => Promise.reject(error),
    );

    // Response interceptor — handle 401
    this.client.interceptors.response.use(
      response => response,
      async (error: AxiosError) => {
        if (error.response?.status === 401) {
          await this.clearToken();
          apiEvents.emit('logout');
          return Promise.reject(new AuthError());
        }
        return Promise.reject(error);
      },
    );
  }

  // ── Private: core request helper ──────────────────────────────────────────

  private async request<T>(config: AxiosRequestConfig): Promise<T> {
    try {
      const response = await this.client.request<ApiResponse<T>>(config);
      const body = response.data;

      if (!body.success || body.data === undefined) {
        throw new ApiError(
          body.error ?? 'An unexpected error occurred.',
          response.status,
        );
      }

      return body.data;
    } catch (err) {
      if (err instanceof AuthError || err instanceof ApiError) {
        throw err;
      }

      const axiosErr = err as AxiosError<ApiResponse<never>>;

      if (axiosErr.response) {
        const status = axiosErr.response.status;
        const serverError = axiosErr.response.data?.error ?? axiosErr.message;
        throw new ApiError(serverError, status);
      }

      if (axiosErr.code === 'ECONNABORTED') {
        throw new NetworkError(
          'Request timed out. Check your connection and try again.',
          'TIMEOUT',
        );
      }

      if (axiosErr.code === 'ERR_NETWORK' || !axiosErr.response) {
        throw new NetworkError(
          'Unable to reach the server. Check your connection.',
          'NO_CONNECTION',
        );
      }

      throw new NetworkError(
        (err as Error).message ?? 'Unknown network error.',
        'UNKNOWN',
      );
    }
  }

  // ── Token management ──────────────────────────────────────────────────────

  async saveToken(token: string): Promise<void> {
    await AsyncStorage.setItem(TOKEN_STORAGE_KEY, token);
  }

  async getToken(): Promise<string | null> {
    return AsyncStorage.getItem(TOKEN_STORAGE_KEY);
  }

  async clearToken(): Promise<void> {
    await AsyncStorage.removeItem(TOKEN_STORAGE_KEY);
  }

  // ── Auth ──────────────────────────────────────────────────────────────────

  async register(params: RegisterParams): Promise<void> {
    await this.request<RegisterResponseData>({
      method: 'POST',
      url: '/users/register',
      data: params,
    });
  }

  async login(params: LoginParams): Promise<string> {
    const data = await this.request<LoginResponseData>({
      method: 'POST',
      url: '/auth/login',
      data: params,
    });

    await this.saveToken(data.token);
    return data.token;
  }

  // ── Users ─────────────────────────────────────────────────────────────────

  async updatePushToken(userId: string, push_token: string): Promise<void> {
    await this.request<void>({
      method: 'PUT',
      url: `/users/${encodeURIComponent(userId)}/push-token`,
      data: { push_token },
    });
  }

  // ── Verification ──────────────────────────────────────────────────────────

  async submitProof(
    verification_request_id: string,
    proof: Proof,
  ): Promise<VerificationResult> {
    return this.request<VerificationResult>({
      method: 'POST',
      url: '/verification/submit-proof',
      // Backend SubmitProofSchema field name (verification.route.ts).
      data: { verification_requestId: verification_request_id, proof },
    });
  }

  async rejectVerification(requestId: string): Promise<void> {
    await this.request<void>({
      method: 'POST',
      url: `/verification/reject/${encodeURIComponent(requestId)}`,
    });
  }

  async getVerificationHistory(): Promise<VerificationRequest[]> {
    return this.request<VerificationRequest[]>({
      method: 'GET',
      url: '/verification/history',
    });
  }

  // ── Device pairing (SRS FR-003, API-025) ──────────────────────────────────

  /**
   * Redeems a browser-extension pairing QR challenge, linking that browser to
   * this device's account. `signature` is the device key's signature from
   * CryptoService.signQrChallenge (ALG-007). Throws ApiError with the server
   * message on an invalid code (400), bad signature (401), already-used (409)
   * or expired (410) code.
   */
  async redeemQrChallenge(
    challengeId: string,
    code: string,
    signature: string,
  ): Promise<QrChallengeRedeemResult> {
    return this.request<QrChallengeRedeemResult>({
      method: 'POST',
      url: '/qr-challenges/redeem',
      data: { challengeId, code, signature },
    });
  }

  // ── Mobile wallet UI (Phase 6) ────────────────────────────────────────────

  /**
   * Like request(), but also accepts a bare (non-enveloped) body — the issuer
   * proxy routes return the issuer's reply as-is.
   */
  private async requestLoose<T>(config: AxiosRequestConfig): Promise<T> {
    try {
      const response = await this.client.request<unknown>(config);
      const body = response.data as Record<string, unknown> | null;
      if (body && typeof body === 'object' && 'success' in body) {
        if (body.success === false) {
          throw new ApiError(String(body.error ?? 'Request failed.'), response.status);
        }
        if ('data' in body) return body.data as T;
      }
      return body as T;
    } catch (err) {
      if (err instanceof AuthError || err instanceof ApiError) throw err;
      const axiosErr = err as AxiosError<{ error?: string; message?: string }>;
      if (axiosErr.response) {
        const data = axiosErr.response.data;
        throw new ApiError(data?.error ?? data?.message ?? axiosErr.message, axiosErr.response.status);
      }
      throw new NetworkError('Unable to reach the server. Check your connection.', 'NO_CONNECTION');
    }
  }

  /** API-018 email + password sign-in. Saves and returns the JWT. */
  async signIn(email: string, password: string): Promise<string> {
    const data = await this.request<LoginResponseData>({
      method: 'POST',
      url: '/auth/login',
      data: { email, password },
    });
    await this.saveToken(data.token);
    return data.token;
  }

  /** Registers this device's Keystore public key (PEM) for the signed-in user. */
  async updateMyPublicKey(publicKeyPem: string): Promise<void> {
    await this.request<null>({ method: 'PUT', url: '/users/me/public-key', data: { public_key: publicKeyPem } });
  }

  /** Requests routed to this user that await approval (UC-004). */
  async getPendingRequests(): Promise<PendingRequestDTO[]> {
    return this.request<PendingRequestDTO[]>({ method: 'GET', url: '/verification/pending' });
  }

  /** API-038 history, newest first. */
  async getHistory(page = 1, limit = 50): Promise<HistoryRecordDTO[]> {
    return this.request<HistoryRecordDTO[]>({ method: 'GET', url: '/verification/history', params: { page, limit } });
  }

  /** API-039 (FR-030): hide one entry from this user's history (SP log kept, BR-023). */
  async deleteHistoryEntry(requestId: string): Promise<void> {
    await this.request<unknown>({ method: 'DELETE', url: `/verification/history/${encodeURIComponent(requestId)}` });
  }

  /** API-040 (FR-030): clear this user's history. */
  async clearHistory(): Promise<void> {
    await this.request<unknown>({ method: 'DELETE', url: '/verification/history' });
  }

  /** API-037 (FR-025): no valid credential carries the requested predicate. */
  async failVerification(requestId: string): Promise<void> {
    await this.request<unknown>({ method: 'POST', url: `/verification/fail/${encodeURIComponent(requestId)}` });
  }

  async checkRevocation(credentialId: string): Promise<{ revoked?: boolean; status?: string }> {
    return this.request({ method: 'GET', url: `/credentials/${encodeURIComponent(credentialId)}/revocation` });
  }

  async nadraVerify(cnic: string, phone: string): Promise<{ session_id: string }> {
    return this.requestLoose({ method: 'POST', url: '/credentials/nadra/verify', data: { cnic, phone } });
  }

  async nadraVerifyOtp(sessionId: string, otp: string): Promise<{ credential: SDJWTCredential }> {
    return this.requestLoose({ method: 'POST', url: '/credentials/nadra/verify-otp', data: { session_id: sessionId, otp } });
  }

  async hecVerify(body: { degree_number: string; university: string; student_name: string }): Promise<{ credential: SDJWTCredential }> {
    return this.requestLoose({ method: 'POST', url: '/credentials/hec/verify', data: body });
  }

  async auScrape(body: { username: string; password: string }): Promise<{ credential: SDJWTCredential }> {
    return this.requestLoose({ method: 'POST', url: '/credentials/au/scrape', data: body, timeout: 60_000 });
  }

  async linkedinAuthUrl(): Promise<{ auth_url: string }> {
    return this.requestLoose({ method: 'GET', url: '/credentials/linkedin/auth-url' });
  }

  async linkedinStatus(): Promise<{ status: string; credential?: SDJWTCredential }> {
    return this.requestLoose({ method: 'GET', url: '/credentials/linkedin/status' });
  }

  // ── Issuers ───────────────────────────────────────────────────────────────

  async getIssuerPublicKey(issuerId: string): Promise<string> {
    const data = await this.request<IssuerPublicKeyData>({
      method: 'GET',
      url: `/issuers/${encodeURIComponent(issuerId)}/public-key`,
    });

    return data.public_key;
  }
}

/** GET /verification/pending row (verification.service.ts getPendingForUser). */
export interface PendingRequestDTO {
  requestId: string;
  verifierId: string;
  verifierName: string;
  verifierDomain: string | null;
  predicate: string;
  predicateLabel: string;
  requestedFields: string[];
  nonce: string;
  pageUrl: string | null;
  createdAt: string;
  expiresAt: string;
}

/** GET /verification/history row (verification.service.ts getHistory). */
export interface HistoryRecordDTO {
  requestId: string;
  verifierId: string;
  verifierName: string;
  predicate: string;
  predicateLabel: string;
  decidedAt: string | null;
  outcome: string;
  issuer: string | null;
  status: string;
  created_at: string;
}

export interface QrChallengeRedeemResult {
  challengeId: string;
  purpose: 'PAIRING';
  state: 'REDEEMED';
  expiresAt: string;
  redeemedAt: string | null;
}

// ─── Singleton Export ─────────────────────────────────────────────────────────

export const apiService = new ApiService();
