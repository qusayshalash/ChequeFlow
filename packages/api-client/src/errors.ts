import { ApiErrorCode, type ApiErrorBody, type ApiFieldError } from '@cheque-flow/shared-types';

/**
 * A failed API call, in a shape the UI can render directly.
 *
 * `messageKey` is a translation key, so screens never hard-code English text
 * coming from the server.
 */
export class ApiClientError extends Error {
  readonly code: ApiErrorCode;
  readonly messageKey: string;
  readonly status: number;
  readonly requestId: string | null;
  readonly fieldErrors: ApiFieldError[];
  readonly details: Record<string, string | number | boolean | null>;

  constructor(init: {
    code: ApiErrorCode;
    messageKey: string;
    message: string;
    status: number;
    requestId?: string | null;
    fieldErrors?: ApiFieldError[];
    details?: Record<string, string | number | boolean | null>;
  }) {
    super(init.message);
    this.name = 'ApiClientError';
    this.code = init.code;
    this.messageKey = init.messageKey;
    this.status = init.status;
    this.requestId = init.requestId ?? null;
    this.fieldErrors = init.fieldErrors ?? [];
    this.details = init.details ?? {};
  }

  /** True when the session is gone and the user must sign in again. */
  get isAuthError(): boolean {
    return (
      this.code === ApiErrorCode.UNAUTHENTICATED || this.code === ApiErrorCode.INVALID_CREDENTIALS
    );
  }

  get isDuplicate(): boolean {
    return this.code === ApiErrorCode.DUPLICATE_CHEQUE;
  }

  /** Field errors keyed by path, for form libraries. */
  get fieldErrorMap(): Record<string, string> {
    return Object.fromEntries(this.fieldErrors.map((error) => [error.path, error.message]));
  }

  static isApiErrorBody(value: unknown): value is ApiErrorBody {
    if (typeof value !== 'object' || value === null) return false;
    const candidate = (value as { error?: unknown }).error;
    return (
      typeof candidate === 'object' &&
      candidate !== null &&
      typeof (candidate as { code?: unknown }).code === 'string'
    );
  }

  /** Builds an error from a response body, falling back to a network error. */
  static fromResponse(status: number, body: unknown, requestId: string | null): ApiClientError {
    if (ApiClientError.isApiErrorBody(body)) {
      return new ApiClientError({
        code: body.error.code,
        messageKey: body.error.messageKey,
        message: body.error.message,
        status,
        requestId: body.error.requestId || requestId,
        ...(body.error.fieldErrors ? { fieldErrors: body.error.fieldErrors } : {}),
        ...(body.error.details ? { details: body.error.details } : {}),
      });
    }

    return new ApiClientError({
      code: ApiErrorCode.INTERNAL_ERROR,
      messageKey: 'errors.INTERNAL_ERROR',
      message: `Unexpected response (${status})`,
      status,
      requestId,
    });
  }

  static network(cause: unknown): ApiClientError {
    return new ApiClientError({
      code: ApiErrorCode.INTERNAL_ERROR,
      messageKey: 'errors.network',
      message: cause instanceof Error ? cause.message : 'Network request failed',
      status: 0,
      requestId: null,
    });
  }
}
