import { Injectable, Logger } from '@nestjs/common';

import {
  computeOverallConfidence,
  type ChequeExtractionResult,
  type OcrChequeInput,
  type OcrProvider,
} from '@cheque-flow/shared-types';

import { parseChequeText } from './cheque-text-parser';

/**
 * The slice of the Google Vision response this provider reads.
 *
 * Declared locally rather than imported so the vendor's deeply nullable
 * generated types do not leak into the provider, and so the unit tests can
 * supply a stub without pulling in the SDK.
 */
export interface VisionTextResponse {
  fullTextAnnotation?: {
    text?: string | null;
    pages?: Array<{ confidence?: number | null } | null> | null;
  } | null;
  error?: { message?: string | null } | null;
}

export interface VisionClient {
  documentTextDetection(request: {
    image: { content: Buffer };
    imageContext?: { languageHints?: string[] };
  }): Promise<[VisionTextResponse, ...unknown[]]>;
}

export interface GoogleVisionOcrOptions {
  /** Path to a service account JSON key; omit to use application default credentials. */
  keyFilename?: string | undefined;
  /** Injected in tests so no network call is made. */
  client?: VisionClient;
}

/**
 * OCR backed by Google Cloud Vision.
 *
 * Vision returns characters, not meaning, so the recognised text is handed to
 * {@link parseChequeText} which applies the cheque-specific heuristics. That
 * split keeps the vendor call thin and puts all the accuracy-critical logic in
 * a pure, unit-tested module.
 *
 * Expect it to read the printed parts of a cheque — number, MICR line, bank,
 * dates — and to leave handwritten fields empty. That is the intended
 * behaviour: an empty field flagged for review is safer than a confident
 * wrong one.
 */
@Injectable()
export class GoogleVisionOcrProvider implements OcrProvider {
  readonly name = 'google-vision';
  readonly needsImageBytes = true;

  private readonly logger = new Logger(GoogleVisionOcrProvider.name);
  private clientPromise: Promise<VisionClient> | null = null;

  constructor(private readonly options: GoogleVisionOcrOptions = {}) {}

  /**
   * Loads the vendor SDK lazily so an install that never selects this provider
   * does not pay its start-up cost.
   */
  private async getClient(): Promise<VisionClient> {
    if (this.options.client) return this.options.client;

    this.clientPromise ??= (async () => {
      const vision = await import('@google-cloud/vision');
      const ImageAnnotatorClient = vision.ImageAnnotatorClient;
      return new ImageAnnotatorClient(
        this.options.keyFilename ? { keyFilename: this.options.keyFilename } : {},
      );
    })();

    return this.clientPromise;
  }

  async processCheque(input: OcrChequeInput): Promise<ChequeExtractionResult> {
    const startedAt = Date.now();

    // The front carries every field; sending the back as well only adds noise
    // and cost, and its text would be merged into the same page.
    const front =
      input.images.find((image) => image.side === 'FRONT' && image.bytes) ??
      input.images.find((image) => image.bytes);

    if (!front?.bytes) {
      throw new Error('Google Vision OCR requires the image bytes to be loaded');
    }

    const client = await this.getClient();
    const [response] = await client.documentTextDetection({
      image: { content: Buffer.from(front.bytes) },
      imageContext: { languageHints: [...(input.languageHints ?? ['ar', 'en'])] },
    });

    if (response.error?.message) {
      throw new Error(`Google Vision returned an error: ${response.error.message}`);
    }

    const text = response.fullTextAnnotation?.text ?? '';
    if (text.trim().length === 0) {
      throw new Error('Google Vision found no text in the image');
    }

    const pages = response.fullTextAnnotation?.pages ?? [];
    const confidences = pages
      .map((page) => page?.confidence)
      .filter((confidence): confidence is number => typeof confidence === 'number');
    const engineConfidence =
      confidences.length > 0
        ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length
        : undefined;

    const fields = parseChequeText({
      text,
      ...(engineConfidence === undefined ? {} : { engineConfidence }),
      ...(input.knownBankNames ? { knownBankNames: input.knownBankNames } : {}),
      ...(input.expectedCurrency ? { expectedCurrency: input.expectedCurrency } : {}),
    });

    const overallConfidence = computeOverallConfidence(fields);

    // Metrics only — the recognised text is cheque data and is not logged.
    this.logger.debug(
      `Read cheque ${input.chequeId} in ${Date.now() - startedAt}ms ` +
        `(confidence ${overallConfidence}, ${text.length} characters)`,
    );

    return {
      provider: this.name,
      providerRequestId: `${input.chequeId}:${startedAt}`,
      fields,
      overallConfidence,
      processingTimeMs: Date.now() - startedAt,
      raw: {
        provider: this.name,
        engineConfidence: engineConfidence ?? null,
        characterCount: text.length,
        lineCount: text.split(/\r?\n/).filter((line) => line.trim().length > 0).length,
        side: front.side,
      },
    };
  }
}
