/**
 * Provider-agnostic OCR contract.
 *
 * Any concrete provider (mock, cloud vendor, on-premise model) implements
 * {@link OcrProvider}. The application layer never depends on a vendor SDK.
 */

export interface ExtractedField<T> {
  value: T | null;
  /** Normalised confidence in the range [0, 1]. */
  confidence: number;
  rawText?: string;
}

export interface ChequeExtractedFields {
  chequeNumber: ExtractedField<string>;
  numericAmount: ExtractedField<string>;
  writtenAmount: ExtractedField<string>;
  currency: ExtractedField<string>;
  issueDate: ExtractedField<string>;
  dueDate: ExtractedField<string>;
  drawerName: ExtractedField<string>;
  payeeName: ExtractedField<string>;
  bankName: ExtractedField<string>;
  bankBranch: ExtractedField<string>;
  accountNumber: ExtractedField<string>;
  micr: ExtractedField<string>;
  signatureDetected: ExtractedField<boolean>;
}

export type ChequeExtractedFieldName = keyof ChequeExtractedFields;

export const CHEQUE_EXTRACTED_FIELD_NAMES: readonly ChequeExtractedFieldName[] = [
  'chequeNumber',
  'numericAmount',
  'writtenAmount',
  'currency',
  'issueDate',
  'dueDate',
  'drawerName',
  'payeeName',
  'bankName',
  'bankBranch',
  'accountNumber',
  'micr',
  'signatureDetected',
] as const;

export interface OcrChequeImageInput {
  side: 'FRONT' | 'BACK';
  /** Storage key of the already uploaded image. */
  storageKey: string;
  mimeType: string;
  /** Raw bytes, provided when the provider cannot read from object storage. */
  bytes?: Uint8Array;
}

export interface OcrChequeInput {
  chequeId: string;
  organizationId: string;
  images: readonly OcrChequeImageInput[];
  /** BCP-47 hints, e.g. `['ar', 'en']`. */
  languageHints?: readonly string[];
  /** ISO-4217 code expected by the organization, used to disambiguate. */
  expectedCurrency?: string;
  /**
   * Bank names already known to the organization. Text-only providers match
   * the scanned text against these instead of guessing what a bank name
   * looks like.
   */
  knownBankNames?: readonly string[];
}

export interface ChequeExtractionResult {
  provider: string;
  providerRequestId: string;
  fields: ChequeExtractedFields;
  /** Mean confidence across the fields the provider returned a value for. */
  overallConfidence: number;
  processingTimeMs: number;
  /** Untyped vendor payload persisted verbatim for audit and re-processing. */
  raw: unknown;
}

export interface OcrProvider {
  readonly name: string;
  /**
   * Whether the provider reads the image itself. When true the caller loads
   * the bytes from object storage and puts them on `OcrChequeImageInput.bytes`;
   * providers that read straight from storage (or invent data, like the mock)
   * leave this false so nothing is downloaded needlessly.
   */
  readonly needsImageBytes?: boolean;
  processCheque(input: OcrChequeInput): Promise<ChequeExtractionResult>;
}

/** Fields below this confidence are highlighted for the reviewer. */
export const LOW_CONFIDENCE_THRESHOLD = 0.75;

export function isLowConfidence(field: ExtractedField<unknown>): boolean {
  return field.value === null || field.confidence < LOW_CONFIDENCE_THRESHOLD;
}

export function computeOverallConfidence(fields: ChequeExtractedFields): number {
  const present = CHEQUE_EXTRACTED_FIELD_NAMES.map((name) => fields[name]).filter(
    (f) => f.value !== null,
  );
  if (present.length === 0) return 0;
  const sum = present.reduce((acc, f) => acc + f.confidence, 0);
  return Number((sum / present.length).toFixed(4));
}
