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
  Proof,
  VerificationResult,
  VerificationRequest,
} from '@nexusid/types';

// ─── Constants ────────────────────────────────────────────────────────────────

const BASE_URL =
  (process.env.API_URL ?? 'http://10.0.2.2:4000/api/v1').replace(/\/$/, '');

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
      (response) => response,
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
        const serverError =
          axiosErr.response.data?.error ?? axiosErr.message;
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
      data: { verification_request_id, proof },
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

  // ── Issuers ───────────────────────────────────────────────────────────────

  async getIssuerPublicKey(issuerId: string): Promise<string> {
    const data = await this.request<IssuerPublicKeyData>({
      method: 'GET',
      url: `/issuers/${encodeURIComponent(issuerId)}/public-key`,
    });

    return data.public_key;
  }
}

// ─── Singleton Export ─────────────────────────────────────────────────────────

export const apiService = new ApiService();
