/**
 * Injection token for the OCR provider.
 *
 * Application code depends on the `OcrProvider` interface from
 * `@cheque-flow/shared-types`, never on a concrete vendor implementation.
 */
export const OCR_PROVIDER = Symbol('OCR_PROVIDER');
