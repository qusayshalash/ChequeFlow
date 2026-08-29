import { Injectable, Logger } from '@nestjs/common';
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { z } from 'zod';

import {
  computeOverallConfidence,
  type ChequeExtractedFields,
  type ChequeExtractionResult,
  type ExtractedField,
  type OcrChequeInput,
  type OcrProvider,
} from '@cheque-flow/shared-types';

/**
 * A single extracted field as the model reports it.
 *
 * `confidence` is the model's own certainty; `null` values are required rather
 * than optional so the model must state explicitly that it could not read a
 * field instead of silently omitting it.
 */
const extractedString = z.object({
  value: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  rawText: z.string().nullable(),
});

const extractedBoolean = z.object({
  value: z.boolean().nullable(),
  confidence: z.number().min(0).max(1),
  rawText: z.string().nullable(),
});

const chequeExtractionSchema = z.object({
  chequeNumber: extractedString,
  numericAmount: extractedString,
  writtenAmount: extractedString,
  currency: extractedString,
  issueDate: extractedString,
  dueDate: extractedString,
  drawerName: extractedString,
  payeeName: extractedString,
  bankName: extractedString,
  bankBranch: extractedString,
  accountNumber: extractedString,
  micr: extractedString,
  signatureDetected: extractedBoolean,
});

type ClaudeChequeExtraction = z.infer<typeof chequeExtractionSchema>;

const SYSTEM_PROMPT = [
  'You read scanned bank cheques and return the fields exactly as printed or written on them.',
  'Cheques may be in Arabic, English, or both. Arabic text reads right to left.',
  '',
  'Rules:',
  '- Transcribe what is on the cheque. Never guess, infer, or complete a partially visible value.',
  '- If a field is absent, illegible, or obscured, set its value to null and its confidence to 0.',
  '- confidence is your own certainty for that single field, from 0 to 1. Be conservative:',
  '  use below 0.7 for handwriting you are not sure of, and above 0.9 only for clearly printed text.',
  '- numericAmount: digits only, with a decimal point and no thousands separators (e.g. "1500.50").',
  '- writtenAmount: the amount spelled out in words, transcribed verbatim in its original language.',
  '- If the numeric and written amounts disagree, report both as printed and lower both confidences.',
  '- issueDate and dueDate: ISO format YYYY-MM-DD. A Hijri date must be converted to Gregorian;',
  '  put the original text in rawText and lower the confidence.',
  '- currency: the ISO-4217 code (ILS, JOD, USD, ...).',
  '- micr: the magnetic character line along the bottom edge, transcribed verbatim.',
  '- signatureDetected: whether a signature is visibly present, not whether it is valid.',
  '- rawText: the exact characters you read for that field, before any normalisation. Use null',
  '  when you set the value to null.',
].join('\n');

export interface ClaudeVisionOcrOptions {
  apiKey: string;
  model: string;
  /** Upper bound on the response size; the payload is a small JSON object. */
  maxTokens: number;
  /** Injected in tests so no network call is made. */
  client?: Anthropic;
}

/**
 * OCR backed by Claude's vision capability.
 *
 * The cheque images are sent to the Messages API and the response is
 * constrained to {@link chequeExtractionSchema} through structured outputs, so
 * the provider returns typed fields rather than free text that would need
 * parsing. As with every provider, the result is only ever a *suggestion*:
 * `OcrService` stores it in `ocr_extractions` and a human confirms it.
 */
@Injectable()
export class ClaudeVisionOcrProvider implements OcrProvider {
  readonly name = 'claude-vision';
  /** The model reads the pixels, so the caller must supply the bytes. */
  readonly needsImageBytes = true;

  private readonly logger = new Logger(ClaudeVisionOcrProvider.name);
  private readonly client: Anthropic;

  constructor(private readonly options: ClaudeVisionOcrOptions) {
    this.client = options.client ?? new Anthropic({ apiKey: options.apiKey });
  }

  async processCheque(input: OcrChequeInput): Promise<ChequeExtractionResult> {
    const startedAt = Date.now();

    const images = input.images.filter(
      (image): image is typeof image & { bytes: Uint8Array } =>
        image.bytes !== undefined && image.bytes.byteLength > 0,
    );
    if (images.length === 0) {
      throw new Error('Claude vision OCR requires the image bytes to be loaded');
    }

    const content: Anthropic.ContentBlockParam[] = [];
    for (const image of images) {
      content.push({
        type: 'text',
        text: image.side === 'FRONT' ? 'Front of the cheque:' : 'Back of the cheque:',
      });
      content.push({
        type: 'image',
        source: {
          type: 'base64',
          media_type: toSupportedMediaType(image.mimeType),
          data: Buffer.from(image.bytes).toString('base64'),
        },
      });
    }

    const expectations = [
      input.expectedCurrency
        ? `The organization's default currency is ${input.expectedCurrency}, but report what the cheque actually shows.`
        : null,
      input.languageHints && input.languageHints.length > 0
        ? `Expected languages: ${input.languageHints.join(', ')}.`
        : null,
      'Extract every field. Set a field to null when you cannot read it.',
    ].filter((line): line is string => line !== null);
    content.push({ type: 'text', text: expectations.join('\n') });

    const response = await this.client.messages.parse({
      model: this.options.model,
      max_tokens: this.options.maxTokens,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content }],
      output_config: { format: zodOutputFormat(chequeExtractionSchema) },
    });

    // A safety decline returns HTTP 200 with no parsed payload, so check it
    // before reading the result.
    if (response.stop_reason === 'refusal') {
      throw new Error('The model declined to read this image');
    }

    const parsed = response.parsed_output;
    if (!parsed) {
      throw new Error('The model returned no structured output');
    }

    const fields = toChequeExtractedFields(parsed);
    const overallConfidence = computeOverallConfidence(fields);

    // Metrics only: never the transcribed values, which are cheque data.
    this.logger.debug(
      `Extracted cheque ${input.chequeId} in ${Date.now() - startedAt}ms ` +
        `(confidence ${overallConfidence}, ${response.usage.input_tokens} in / ` +
        `${response.usage.output_tokens} out tokens)`,
    );

    return {
      provider: this.name,
      providerRequestId: response.id,
      fields,
      overallConfidence,
      processingTimeMs: Date.now() - startedAt,
      // Usage only — never the image or the transcribed values, which the
      // extraction row already stores in its own columns.
      raw: {
        provider: this.name,
        model: response.model,
        stopReason: response.stop_reason,
        usage: {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        },
        imageCount: images.length,
        sides: images.map((image) => image.side),
      },
    };
  }
}

/** Media types the Messages API accepts for image blocks. */
type SupportedImageMediaType = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/gif';

function toSupportedMediaType(mimeType: string): SupportedImageMediaType {
  switch (mimeType) {
    case 'image/jpeg':
    case 'image/png':
    case 'image/webp':
    case 'image/gif':
      return mimeType;
    default:
      // The upload pipeline only stores jpeg/png/webp/pdf; a PDF never reaches
      // an image block, so anything else is treated as a JPEG rather than
      // failing the whole extraction.
      return 'image/jpeg';
  }
}

/** Clamps a model-reported confidence into [0, 1] and drops empty strings. */
function toField<T>(raw: {
  value: T | null;
  confidence: number;
  rawText: string | null;
}): ExtractedField<T> {
  const value =
    raw.value === null || (typeof raw.value === 'string' && raw.value.trim().length === 0)
      ? null
      : raw.value;

  return {
    value,
    // A missing value can never carry confidence, whatever the model claimed.
    confidence: value === null ? 0 : Math.min(1, Math.max(0, raw.confidence)),
    ...(raw.rawText ? { rawText: raw.rawText } : {}),
  };
}

function toChequeExtractedFields(parsed: ClaudeChequeExtraction): ChequeExtractedFields {
  return {
    chequeNumber: toField(parsed.chequeNumber),
    numericAmount: toField(normalizeAmount(parsed.numericAmount)),
    writtenAmount: toField(parsed.writtenAmount),
    currency: toField(normalizeCurrency(parsed.currency)),
    issueDate: toField(parsed.issueDate),
    dueDate: toField(parsed.dueDate),
    drawerName: toField(parsed.drawerName),
    payeeName: toField(parsed.payeeName),
    bankName: toField(parsed.bankName),
    bankBranch: toField(parsed.bankBranch),
    accountNumber: toField(parsed.accountNumber),
    micr: toField(parsed.micr),
    signatureDetected: toField(parsed.signatureDetected),
  };
}

/**
 * Normalises the amount to the plain decimal string the rest of the system
 * uses. A value that still does not look like a number is rejected rather than
 * passed on, so the reviewer sees an empty field instead of junk.
 */
function normalizeAmount(raw: {
  value: string | null;
  confidence: number;
  rawText: string | null;
}): { value: string | null; confidence: number; rawText: string | null } {
  if (raw.value === null) return raw;

  const cleaned = raw.value
    // Arabic-Indic digits arrive as U+0660..U+0669.
    .replace(/[٠-٩]/g, (digit) => String(digit.charCodeAt(0) - 0x0660))
    .replace(/[\s,٬]/g, '')
    .replace(/٫/g, '.')
    .trim();

  return /^\d+(\.\d{1,2})?$/.test(cleaned)
    ? { ...raw, value: cleaned }
    : { value: null, confidence: 0, rawText: raw.rawText ?? raw.value };
}

function normalizeCurrency(raw: {
  value: string | null;
  confidence: number;
  rawText: string | null;
}): { value: string | null; confidence: number; rawText: string | null } {
  if (raw.value === null) return raw;
  const code = raw.value.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(code)
    ? { ...raw, value: code }
    : { value: null, confidence: 0, rawText: raw.rawText ?? raw.value };
}
