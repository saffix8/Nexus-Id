import type { Request, Response, NextFunction } from 'express';
import type { ApiResponse } from '@nexusid/types';

// ── Custom error classes ──────────────────────────────────────────────────────

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode = 500, isOperational = true) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.isOperational = isOperational;

    // Restore correct prototype chain after extending Error
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  public readonly fields?: Record<string, string>;

  constructor(message: string, fields?: Record<string, string>) {
    super(message, 400);
    this.name = 'ValidationError';
    this.fields = fields;
    Object.setPrototypeOf(this, ValidationError.prototype);
  }
}

export class NotFoundError extends AppError {
  constructor(resource = 'Resource') {
    super(`${resource} not found`, 404);
    this.name = 'NotFoundError';
    Object.setPrototypeOf(this, NotFoundError.prototype);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, 409);
    this.name = 'ConflictError';
    Object.setPrototypeOf(this, ConflictError.prototype);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = 'Forbidden') {
    super(message, 403);
    this.name = 'ForbiddenError';
    Object.setPrototypeOf(this, ForbiddenError.prototype);
  }
}

// ── Zod error shape (used without importing zod to avoid circular deps) ───────

interface ZodIssue {
  path: (string | number)[];
  message: string;
}

interface ZodError {
  name: 'ZodError';
  issues: ZodIssue[];
}

function isZodError(err: unknown): err is ZodError {
  return (
    typeof err === 'object' &&
    err !== null &&
    (err as ZodError).name === 'ZodError' &&
    Array.isArray((err as ZodError).issues)
  );
}

// ── Prisma error detection ────────────────────────────────────────────────────

interface PrismaClientKnownError {
  code: string;
  meta?: Record<string, unknown>;
}

function isPrismaKnownError(err: unknown): err is PrismaClientKnownError {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    typeof (err as PrismaClientKnownError).code === 'string' &&
    (err as PrismaClientKnownError).code.startsWith('P')
  );
}

// ── Error response builder ────────────────────────────────────────────────────

function buildErrorResponse(message: string): ApiResponse<never> {
  return {
    success: false,
    error: message,
    timestamp: new Date().toISOString(),
  };
}

// ── Global error middleware ───────────────────────────────────────────────────

/**
 * errorMiddleware
 * Must be registered LAST in the Express middleware chain (4-argument signature).
 * Catches every error thrown or passed to next(err) anywhere in the app.
 */
export function errorMiddleware(
  err: unknown,
  _req: Request,
  res: Response,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  _next: NextFunction
): void {
  const isDev = process.env.NODE_ENV !== 'production';

  // ── 1. Our own operational errors ─────────────────────────────────────────

  if (err instanceof ValidationError) {
    res.status(400).json({
      ...buildErrorResponse(err.message),
      fields: err.fields,
    });
    return;
  }

  if (err instanceof AppError) {
    if (isDev && !err.isOperational) {
      console.error('[AppError]', err.stack);
    }
    res.status(err.statusCode).json(buildErrorResponse(err.message));
    return;
  }

  // ── 2. Zod validation errors ───────────────────────────────────────────────

  if (isZodError(err)) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of err.issues) {
      const field = issue.path.join('.') || 'root';
      fieldErrors[field] = issue.message;
    }

    res.status(400).json({
      ...buildErrorResponse('Validation failed'),
      fields: fieldErrors,
    });
    return;
  }

  // ── 3. Prisma known errors ─────────────────────────────────────────────────

  if (isPrismaKnownError(err)) {
    switch (err.code) {
      case 'P2002': {
        // Unique constraint violation
        const target = Array.isArray(err.meta?.target)
          ? (err.meta.target as string[]).join(', ')
          : 'field';
        res.status(409).json(buildErrorResponse(`Duplicate value: ${target} already exists`));
        return;
      }
      case 'P2025':
        // Record not found
        res.status(404).json(buildErrorResponse('Record not found'));
        return;
      case 'P2003':
        // Foreign key constraint
        res.status(400).json(buildErrorResponse('Related record does not exist'));
        return;
      default:
        // Log unknown Prisma errors — they're unexpected
        console.error(`[PrismaError] Code ${err.code}:`, err);
        res.status(500).json(buildErrorResponse('Database error'));
        return;
    }
  }

  // ── 4. Native Error objects ────────────────────────────────────────────────

  if (err instanceof Error) {
    // Log all unexpected errors
    console.error('[UnhandledError]', err.stack ?? err.message);

    // Never leak internal error messages in production
    const message = isDev ? err.message : 'Internal server error';
    res.status(500).json(buildErrorResponse(message));
    return;
  }

  // ── 5. Unknown thrown values (e.g. throw "something") ─────────────────────

  console.error('[UnknownError]', err);
  res.status(500).json(buildErrorResponse('An unexpected error occurred'));
}
