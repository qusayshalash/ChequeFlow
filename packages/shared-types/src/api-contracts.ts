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
  /** The request reached a dependency we do not control, and it refused. */
  SERVICE_UNAVAILABLE: 'SERVICE_UNAVAILABLE',
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
/**
 * A value safe to put in an error's `details`.
 *
 * Anything JSON can carry, and nothing else — no Error, no ORM payload, no
 * stack. It was flat scalars, which meant an error could say how many cheques
 * it had matched but not which, and the panels built to list them had nothing
 * to list. What may go in is still the caller's judgement; this only says what
 * shape it must take to cross the wire.
 */
export type ApiErrorDetail =
  | string
  | number
  | boolean
  | null
  | ApiErrorDetail[]
  | { [key: string]: ApiErrorDetail };

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
    details?: Record<string, ApiErrorDetail>;
  };
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  /** Access token lifetime in seconds. */
  expiresIn: number;
  tokenType: 'Bearer';
}
