import type { ZodType } from 'zod';

/** Field errors keyed by field name, as the form components consume them. */
export type FieldErrors = Record<string, string>;

/**
 * Validates a form against the same schema the API uses.
 *
 * Sharing the schema is the point: a rule can never drift between what the
 * phone accepts and what the server accepts, because there is only one rule.
 * Zod's messages are message keys, so they are translated before display.
 */
export function validateForm<T>(
  schema: ZodType<T>,
  input: unknown,
): { ok: true; data: T } | { ok: false; errors: FieldErrors } {
  const result = schema.safeParse(input);
  if (result.success) return { ok: true, data: result.data };

  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const path = issue.path.join('.') || '_';
    // Keep the first error per field: showing three complaints about one input
    // is noise, and the first is the one the user hits first.
    errors[path] ??= issue.message;
  }
  return { ok: false, errors };
}

/**
 * Turns an API field-error payload into the same shape, so a server-side
 * rejection lands on the field that caused it instead of in a generic banner.
 */
export function fieldErrorsFrom(details: unknown): FieldErrors {
  if (typeof details !== 'object' || details === null) return {};
  const record = details as Record<string, unknown>;
  const list = record.fieldErrors;
  if (!Array.isArray(list)) return {};

  const errors: FieldErrors = {};
  for (const entry of list) {
    if (typeof entry !== 'object' || entry === null) continue;
    const item = entry as Record<string, unknown>;
    if (typeof item.path === 'string' && typeof item.message === 'string') {
      errors[item.path] ??= item.message;
    }
  }
  return errors;
}
