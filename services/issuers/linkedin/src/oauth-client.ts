import axios from 'axios';
import { randomUUID } from 'crypto';

export interface LinkedInProfile {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface LinkedInPosition {
  company: string;
  title: string;
  start_year: number;
  end_year: number | null;
  is_current: boolean;
}

interface StateEntry {
  timestamp: number;
}

interface LinkedInTokenResponse {
  access_token: string;
  expires_in: number;
  scope: string;
}

interface LinkedInMeResponse {
  id: string;
  localizedFirstName: string;
  localizedLastName: string;
}

interface LinkedInEmailResponse {
  elements: Array<{
    'handle~': {
      emailAddress: string;
    };
  }>;
}

interface LinkedInPositionsResponse {
  elements: Array<{
    company: {
      name: string;
    };
    title: {
      name: string;
    };
    timePeriod: {
      startDate: { year: number; month?: number };
      endDate?: { year: number; month?: number };
    };
  }>;
}

const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

export class LinkedInOAuthClient {
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly redirectURI: string;
  private readonly stateMap = new Map<string, StateEntry>();

  constructor() {
    const clientId = process.env.LINKEDIN_CLIENT_ID;
    const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
    const redirectURI = process.env.LINKEDIN_REDIRECT_URI ?? 'http://localhost:4004/api/v1/credentials/linkedin/callback';

    if (!clientId) throw new Error('LINKEDIN_CLIENT_ID environment variable is required');
    if (!clientSecret) throw new Error('LINKEDIN_CLIENT_SECRET environment variable is required');

    this.clientId = clientId;
    this.clientSecret = clientSecret;
    this.redirectURI = redirectURI;
  }

  getAuthorizationURL(): string {
    this.purgeExpiredStates();

    const state = randomUUID();
    this.stateMap.set(state, { timestamp: Date.now() });

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId,
      redirect_uri: this.redirectURI,
      scope: 'r_liteprofile r_emailaddress',
      state,
    });

    return `https://www.linkedin.com/oauth/v2/authorization?${params.toString()}`;
  }

  async exchangeCodeForToken(code: string, state: string): Promise<string> {
    this.purgeExpiredStates();

    const entry = this.stateMap.get(state);
    if (!entry) {
      throw new LinkedInOAuthError('INVALID_STATE', 'Invalid or expired OAuth state parameter — possible CSRF attack');
    }
    this.stateMap.delete(state);

    const params = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectURI,
      client_id: this.clientId,
      client_secret: this.clientSecret,
    });

    const response = await axios.post<LinkedInTokenResponse>(
      'https://www.linkedin.com/oauth/v2/accessToken',
      params.toString(),
      { headers: { 'Content-Type': 'application/x-www-form-urlencoded' } }
    );

    return response.data.access_token;
  }

  async getProfile(accessToken: string): Promise<LinkedInProfile> {
    const headers = { Authorization: `Bearer ${accessToken}` };

    const [meRes, emailRes] = await Promise.all([
      axios.get<LinkedInMeResponse>(
        'https://api.linkedin.com/v2/me?projection=(id,localizedFirstName,localizedLastName)',
        { headers }
      ),
      axios.get<LinkedInEmailResponse>(
        'https://api.linkedin.com/v2/emailAddress?q=members&projection=(elements*(handle~))',
        { headers }
      ),
    ]);

    const email = emailRes.data.elements?.[0]?.['handle~']?.emailAddress ?? '';

    return {
      id: meRes.data.id,
      firstName: meRes.data.localizedFirstName,
      lastName: meRes.data.localizedLastName,
      email,
    };
  }

  async getPositions(accessToken: string): Promise<LinkedInPosition[]> {
    const response = await axios.get<LinkedInPositionsResponse>(
      'https://api.linkedin.com/v2/positions?q=members',
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    return (response.data.elements ?? []).map((el) => ({
      company: el.company?.name ?? 'Unknown Company',
      title: el.title?.name ?? 'Unknown Title',
      start_year: el.timePeriod?.startDate?.year ?? new Date().getFullYear(),
      end_year: el.timePeriod?.endDate?.year ?? null,
      is_current: !el.timePeriod?.endDate,
    }));
  }

  private purgeExpiredStates(): void {
    const now = Date.now();
    for (const [state, entry] of this.stateMap.entries()) {
      if (now - entry.timestamp > STATE_TTL_MS) {
        this.stateMap.delete(state);
      }
    }
  }
}

export class LinkedInOAuthError extends Error {
  constructor(
    public readonly code: 'INVALID_STATE' | 'TOKEN_EXCHANGE_FAILED' | 'PROFILE_FETCH_FAILED' | 'POSITIONS_FETCH_FAILED',
    message: string
  ) {
    super(message);
    this.name = 'LinkedInOAuthError';
  }
}

export const linkedInOAuthClient = new LinkedInOAuthClient();
