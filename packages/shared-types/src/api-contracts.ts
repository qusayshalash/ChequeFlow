/** Transport-level contracts shared by the API, the web app and the mobile app. */

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
}

export interface Paginated<T> {
  data: T[];
  meta: PaginationMeta;
}

/** Stable, machine-readable API error codes. */
export const ApiErrorCode = {
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  UNAUTHENTICATED: 'UNAUTHENTICATED',
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  CONFLICT: 'CONFLICT',
  DUPLICATE_CHEQUE: 'DUPLICATE_CHEQUE',
  INVALID_STATE_TRANSITION: 'INVALID_STATE_TRANSITION',
  VERSION_CONFLICT: 'VERSION_CONFLICT',
  RATE_LIMITED: 'RATE_LIMITED',
  UNSUPPORTED_MEDIA_TYPE: 'UNSUPPORTED_MEDIA_TYPE',
  PAYLOAD_TOO_LARGE: 'PAYLOAD_TOO_LARGE',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;
export type ApiErrorCode = (typeof ApiErrorCode)[keyof typeof ApiErrorCode];

export interface ApiFieldError {
  path: string;
  message: string;
}

/**
 * The single error envelope returned by every endpoint. `message` is a safe,
 * translatable string; internal details never leave the server.
 */
export interface ApiErrorBody {
  error: {
    code: ApiErrorCode;
    /** Translation key for clients, e.g. `errors.DUPLICATE_CHEQUE`. */
    messageKey: string;
    message: string;
    requestId: string;
    timestamp: string;
    fieldErrors?: ApiFieldError[];
    /** Additional safe, structured context (never internal stack data). */
    details?: Record<string, string | number | boolean | null>;
  };
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
  tokenType: 'Bearer';
}
