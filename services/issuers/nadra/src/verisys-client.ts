import axios, { AxiosInstance } from 'axios';

export interface NadraPersonData {
  cnic: string;
  full_name: string;
  father_name: string;
  date_of_birth: string;
  gender: string;
  address: string;
  issue_date: string;
  expiry_date: string;
  verified: boolean;
}

interface NadraVerificationResponse {
  code: string;
  message: string;
  data: NadraPersonData;
}

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

interface CachedToken {
  value: string;
  expiresAt: number;
}

export class NadraVerificationError extends Error {
  constructor(
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'NadraVerificationError';
  }
}

export class NadraAuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NadraAuthError';
  }
}

export class NadraVerisysClient {
  private readonly baseURL: string;
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly franchiseCode: string;
  private readonly http: AxiosInstance;
  private cachedToken: CachedToken | null = null;

  constructor() {
    const useSandbox = process.env.NADRA_USE_SANDBOX === 'true';
    this.baseURL = useSandbox
      ? 'https://sandbox.verisys.nadra.gov.pk/api/v1'
      : 'https://verisys.nadra.gov.pk/api/v1';

    this.clientId = process.env.NADRA_CLIENT_ID ?? '';
    this.clientSecret = process.env.NADRA_CLIENT_SECRET ?? '';
    this.franchiseCode = process.env.NADRA_FRANCHISE_CODE ?? '';

    if (!this.clientId || !this.clientSecret || !this.franchiseCode) {
      throw new Error(
        'Missing required NADRA env vars: NADRA_CLIENT_ID, NADRA_CLIENT_SECRET, NADRA_FRANCHISE_CODE'
      );
    }

    this.http = axios.create({ baseURL: this.baseURL, timeout: 15_000 });
  }

  async getAuthToken(): Promise<string> {
    const now = Date.now();

    if (this.cachedToken && this.cachedToken.expiresAt > now + 30_000) {
      return this.cachedToken.value;
    }

    try {
      const params = new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.clientId,
        client_secret: this.clientSecret,
      });

      const response = await this.http.post<TokenResponse>(
        '/oauth/token',
        params.toString(),
        { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
      );

      const { access_token, expires_in } = response.data;

      this.cachedToken = {
        value: access_token,
        expiresAt: now + expires_in * 1000,
      };

      return access_token;
    } catch (err) {
      const message = axios.isAxiosError(err)
        ? err.response?.data?.message ?? err.message
        : 'Unknown error during NADRA authentication';
      throw new NadraAuthError(`NADRA auth failed: ${message}`);
    }
  }

  async verifyCNIC(cnic: string, phone: string): Promise<NadraPersonData> {
    const token = await this.getAuthToken();

    try {
      const response = await this.http.post<NadraVerificationResponse>(
        '/verify-cnic',
        {
          cnic,
          contact_number: phone,
          franchise_code: this.franchiseCode,
        },
        {
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        }
      );

      const { code, message, data } = response.data;

      if (code !== '00') {
        throw new NadraVerificationError(code, `NADRA verification failed: ${message}`);
      }

      return data;
    } catch (err) {
      if (err instanceof NadraVerificationError) throw err;

      const message = axios.isAxiosError(err)
        ? err.response?.data?.message ?? err.message
        : 'Unknown error during CNIC verification';

      throw new NadraVerificationError('UNKNOWN', `CNIC verification error: ${message}`);
    }
  }
}

export const nadraClient = new NadraVerisysClient();
