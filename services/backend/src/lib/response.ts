import type { Response } from 'express';
import type {
  ApiResponse,
  PaginatedResponse,
} from '@nexusid/types';

/**
 * Standard success response.
 */
export function success<T>(
  data: T,
  status = 200
): ApiResponse<T> {
  return {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Standard error response.
 */
export function failure(
  error: string,
  status = 500,
  details?: unknown
): ApiResponse<never> {
  return {
    success: false,
    error,
    ...(details !== undefined ? { details } : {}),
    timestamp: new Date().toISOString(),
  };
}

/**
 * Build a paginated response.
 */
export function paginated<T>(
  data: T[],
  meta: {
    page: number;
    limit: number;
    total: number;
  }
): PaginatedResponse<T> {
  const { page, limit, total } = meta;

  return {
    success: true,
    data,
    page,
    limit,
    total,
    has_more: page * limit < total,
    timestamp: new Date().toISOString(),
  };
}

/**
 * Express response helpers.
 */
export const response = {
  success<T>(
    res: Response,
    data: T,
    status = 200
  ): Response {
    return res.status(status).json(success(data, status));
  },

  failure(
    res: Response,
    error: string,
    status = 500,
    details?: unknown
  ): Response {
    return res
      .status(status)
      .json(failure(error, status, details));
  },

  page<T>(
    res: Response,
    data: T[],
    meta: {
      page: number;
      limit: number;
      total: number;
    }
  ): Response {
    return res.status(200).json(paginated(data, meta));
  },
};

export default response;