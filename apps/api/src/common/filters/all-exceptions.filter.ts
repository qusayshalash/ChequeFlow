import {
  ArgumentsHost,
  Catch,
  HttpException,
  HttpStatus,
  Logger,
  type ExceptionFilter,
} from '@nestjs/common';
import { ThrottlerException } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { ApiErrorCode, ChequeTransitionError, type ApiErrorBody } from '@cheque-flow/shared-types';
import {
  isPrismaKnownError,
  PG_RECORD_NOT_FOUND,
  PG_UNIQUE_VIOLATION,
} from '@cheque-flow/database';

import { AppError } from '../errors/app-error';

interface NormalizedError {
  status: number;
  code: ApiErrorCode;
  message: string;
  fieldErrors?: Array<{ path: string; message: string }>;
  details?: Record<string, string | number | boolean | null>;
  /** Message written to the server log; may contain internal detail. */
  logMessage: string;
}

/**
 * Converts every thrown value into the single API error envelope.
 *
 * Nothing internal (stack traces, SQL, provider payloads) ever reaches the
 * client: unexpected errors collapse to INTERNAL_ERROR and are logged with the
 * request id instead.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger('HTTP');

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const request = ctx.getRequest<Request>();
    const response = ctx.getResponse<Response>();
    const requestId = request.requestId ?? 'unknown';

    const normalized = this.normalize(exception);

    const body: ApiErrorBody = {
      error: {
        code: normalized.code,
        messageKey: `errors.${normalized.code}`,
        message: normalized.message,
        requestId,
        timestamp: new Date().toISOString(),
        ...(normalized.fieldErrors ? { fieldErrors: normalized.fieldErrors } : {}),
        ...(normalized.details ? { details: normalized.details } : {}),
      },
    };

    const logLine = `${request.method} ${request.url} -> ${normalized.status} [${requestId}] ${normalized.logMessage}`;
    if (normalized.status >= 500) {
      this.logger.error(logLine, exception instanceof Error ? exception.stack : undefined);
    } else {
      this.logger.warn(logLine);
    }

    response.status(normalized.status).json(body);
  }

  private normalize(exception: unknown): NormalizedError {
    if (exception instanceof AppError) {
      return {
        status: exception.status,
        code: exception.code,
        message: this.publicMessage(exception.code),
        fieldErrors: exception.fieldErrors,
        details: exception.details,
        logMessage: exception.message,
      };
    }

    if (exception instanceof ChequeTransitionError) {
      return {
        status: 409,
        code: ApiErrorCode.INVALID_STATE_TRANSITION,
        message: this.publicMessage(ApiErrorCode.INVALID_STATE_TRANSITION),
        details: { from: exception.from, action: exception.action },
        logMessage: exception.message,
      };
    }

    if (exception instanceof ThrottlerException) {
      return {
        status: 429,
        code: ApiErrorCode.RATE_LIMITED,
        message: this.publicMessage(ApiErrorCode.RATE_LIMITED),
        logMessage: 'rate limit exceeded',
      };
    }

    if (isPrismaKnownError(exception, PG_UNIQUE_VIOLATION)) {
      return {
        status: 409,
        code: ApiErrorCode.CONFLICT,
        message: this.publicMessage(ApiErrorCode.CONFLICT),
        logMessage: `unique constraint violation: ${exception.message}`,
      };
    }

    if (isPrismaKnownError(exception, PG_RECORD_NOT_FOUND)) {
      return {
        status: 404,
        code: ApiErrorCode.NOT_FOUND,
        message: this.publicMessage(ApiErrorCode.NOT_FOUND),
        logMessage: 'record not found',
      };
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      return {
        status,
        code: this.codeForStatus(status),
        message: this.publicMessage(this.codeForStatus(status)),
        logMessage: exception.message,
      };
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      code: ApiErrorCode.INTERNAL_ERROR,
      message: this.publicMessage(ApiErrorCode.INTERNAL_ERROR),
      logMessage: exception instanceof Error ? exception.message : 'non-error thrown',
    };
  }

  private codeForStatus(status: number): ApiErrorCode {
    switch (status) {
      case 400:
      case 422:
        return ApiErrorCode.VALIDATION_ERROR;
      case 401:
        return ApiErrorCode.UNAUTHENTICATED;
      case 403:
        return ApiErrorCode.FORBIDDEN;
      case 404:
        return ApiErrorCode.NOT_FOUND;
      case 409:
        return ApiErrorCode.CONFLICT;
      case 413:
        return ApiErrorCode.PAYLOAD_TOO_LARGE;
      case 415:
        return ApiErrorCode.UNSUPPORTED_MEDIA_TYPE;
      case 429:
        return ApiErrorCode.RATE_LIMITED;
      default:
        return ApiErrorCode.INTERNAL_ERROR;
    }
  }

  /** Generic English fallbacks; clients localize using `messageKey`. */
  private publicMessage(code: ApiErrorCode): string {
    const messages: Record<ApiErrorCode, string> = {
      VALIDATION_ERROR: 'The submitted data is invalid.',
      UNAUTHENTICATED: 'Authentication is required.',
      INVALID_CREDENTIALS: 'Incorrect email or password.',
      FORBIDDEN: 'You do not have permission to perform this action.',
      NOT_FOUND: 'The requested resource was not found.',
      CONFLICT: 'The request conflicts with the current state.',
      DUPLICATE_CHEQUE: 'A matching cheque already exists.',
      INVALID_STATE_TRANSITION: 'This action is not allowed in the current status.',
      VERSION_CONFLICT: 'The record was modified by someone else.',
      RATE_LIMITED: 'Too many requests. Please try again later.',
      UNSUPPORTED_MEDIA_TYPE: 'Unsupported file type.',
      PAYLOAD_TOO_LARGE: 'The uploaded file is too large.',
      INTERNAL_ERROR: 'An unexpected error occurred.',
    };
    return messages[code];
  }
}
