import axios, { AxiosInstance } from 'axios';

export interface HECDegreeData {
  degree_title: string;
  university: string;
  student_name: string;
  registration_number: string;
  year_of_award: number;
  verification_date: string;
}

export interface HECVerificationResponse {
  status: 'verified' | 'not_found';
  degree_details: HECDegreeData;
}

export class HECDegreeNotFoundError extends Error {
  constructor(message = 'Degree not found in HEC database') {
    super(message);
    this.name = 'HECDegreeNotFoundError';
  }
}

export class HECClientError extends Error {
  constructor(
    message: string,
    public readonly statusCode?: number,
  ) {
    super(message);
    this.name = 'HECClientError';
  }
}

export class HECClient {
  private readonly baseURL: string;
  private readonly apiKey: string;
  private readonly http: AxiosInstance;

  constructor() {
    this.baseURL =
      process.env.HEC_BASE_URL ?? 'https://api.hec.gov.pk/degree-verification/v2';
    this.apiKey = process.env.HEC_API_KEY ?? '';

    if (!this.apiKey) {
      console.warn('[HECClient] HEC_API_KEY is not set — requests will be rejected by the API');
    }

    this.http = axios.create({
      baseURL: this.baseURL,
      timeout: 30_000,
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-API-Key': this.apiKey,
      },
    });
  }

  async verifyDegree(params: {
    degree_number: string;
    university: string;
    student_name: string;
  }): Promise<HECVerificationResponse> {
    let response: { data: HECVerificationResponse };

    try {
      response = await this.http.post<HECVerificationResponse>('/verify', {
        degree_number: params.degree_number,
        university: params.university,
        student_name: params.student_name,
      });
    } catch (err: unknown) {
      if (axios.isAxiosError(err)) {
        const status = err.response?.status;
        const message =
          (err.response?.data as { message?: string })?.message ??
          err.message;
        throw new HECClientError(
          `HEC API error: ${message}`,
          status,
        );
      }
      throw new HECClientError('Unexpected error contacting HEC API');
    }

    const { status, degree_details } = response.data;

    if (status !== 'verified') {
      throw new HECDegreeNotFoundError(
        `Degree not found: no record matches degree number "${params.degree_number}" for "${params.student_name}" at "${params.university}"`,
      );
    }

    return { status, degree_details };
  }
}

export const hecClient = new HECClient();
