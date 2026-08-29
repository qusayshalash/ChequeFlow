import { Injectable, type ArgumentMetadata, type PipeTransform } from '@nestjs/common';
import { ApiErrorCode } from '@cheque-flow/shared-types';
import type { ZodType } from 'zod';

import { AppError } from '../errors/app-error';

/**
 * Validates and coerces a request payload with a Zod schema.
 *
 * The same schemas are used by the web and mobile clients, so a value accepted
 * by the UI is accepted by the API and vice versa.
 */
@Injectable()
export class ZodValidationPipe<TOutput> implements PipeTransform<unknown, TOutput> {
  constructor(private readonly schema: ZodType<TOutput>) {}

  transform(value: unknown, _metadata: ArgumentMetadata): TOutput {
    const result = this.schema.safeParse(value);
    if (result.success) {
      return result.data;
    }

    throw new AppError(ApiErrorCode.VALIDATION_ERROR, 'Request payload failed validation', {
      fieldErrors: result.error.issues.map((issue) => ({
        path: issue.path.join('.'),
        // Schema messages are translation keys, resolved by the client.
        message: issue.message,
      })),
    });
  }
}

/** Convenience factory: `@Body(zodBody(createChequeSchema))`. */
export function zodBody<T>(schema: ZodType<T>): ZodValidationPipe<T> {
  return new ZodValidationPipe(schema);
}

/** Convenience factory for query strings: `@Query(zodQuery(listSchema))`. */
export function zodQuery<T>(schema: ZodType<T>): ZodValidationPipe<T> {
  return new ZodValidationPipe(schema);
}
