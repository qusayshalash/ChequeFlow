import { ApiErrorCode } from '@cheque-flow/shared-types';

export interface AppErrorOptions {
  /** Safe, structured context returned to the client. */
  details?: Record<string, string | number | boolean | null>;
  fieldErrors?: Array<{ path: string; message: string }>;
  /** Internal cause, logged but never serialized to the client. */
  cause?: unknown;
}

const STATUS_BY_CODE: Readonly<Record<ApiErrorCode, number>> = {
  VALIDATION_ERROR: 422,
  UNAUTHENTICATED: 401,
  INVALID_CREDENTIALS: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  DUPLICATE_CHEQUE: 409,
  INVALID_STATE_TRANSITION: 409,
  VERSION_CONFLICT: 409,
  RATE_LIMITED: 429,
  UNSUPPORTED_MEDIA_TYPE: 415,
  PAYLOAD_TOO_LARGE: 413,
  INTERNAL_ERROR: 500,
};

/**
 * The single error type thrown by the application layer.
 *
 * `message` is developer-facing and logged; clients receive `messageKey` and a
 * generic localized message, so internal details never leak.
 */
export class AppError extends Error {
  readonly status: number;
  readonly details?: Record<string, string | number | boolean | null>;
  readonly fieldErrors?: Array<{ path: string; message: string }>;

  constructor(
    readonly code: ApiErrorCode,
    message?: string,
    options: AppErrorOptions = {},
  ) {
    super(message ?? code, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'AppError';
    this.status = STATUS_BY_CODE[code];
    this.details = options.details;
    this.fieldErrors = options.fieldErrors;
  }

  get messageKey(): string {
    return `errors.${this.code}`;
  }

  static notFound(entity: string, id?: string): AppError {
    return new AppError(ApiErrorCode.NOT_FOUND, `${entity} not found`, {
      details: { entity, ...(id ? { id } : {}) },
    });
  }

  static forbidden(reason: string, details?: Record<string, string>): AppError {
    return new AppError(ApiErrorCode.FORBIDDEN, reason, { details });
  }

  static conflict(reason: string, details?: Record<string, string>): AppError {
    return new AppError(ApiErrorCode.CONFLICT, reason, { details });
  }

  static versionConflict(expected: number, actual: number): AppError {
    return new AppError(ApiErrorCode.VERSION_CONFLICT, 'Optimistic lock failure', {
      details: { expectedVersion: expected, currentVersion: actual },
    });
  }
}
