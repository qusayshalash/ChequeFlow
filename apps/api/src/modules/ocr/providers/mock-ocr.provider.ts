import { createHash } from 'node:crypto';

import { Injectable } from '@nestjs/common';

import {
  computeOverallConfidence,
  type ChequeExtractedFields,
  type ChequeExtractionResult,
  type ExtractedField,
  type OcrChequeInput,
  type OcrProvider,
} from '@cheque-flow/shared-types';

export interface MockOcrOptions {
  /** Simulated provider latency, so clients exercise their loading states. */
  latencyMs: number;
  /** Seed for the deterministic pseudo random generator. */
  seed: string;
}

/**
 * Deterministic OCR provider used in development and tests.
 *
 * The output is derived from the cheque id and the seed, so the same cheque
 * always produces the same extraction — which makes review-screen tests
 * reproducible. It deliberately returns a few low-confidence and missing
 * fields so the review UI is exercised.
 */
@Injectable()
export class MockOcrProvider implements OcrProvider {
  readonly name = 'mock';

  constructor(private readonly options: MockOcrOptions) {}

  async processCheque(input: OcrChequeInput): Promise<ChequeExtractionResult> {
    const startedAt = Date.now();
    if (this.options.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.options.latencyMs));
    }

    const rng = createSeededRandom(`${this.options.seed}:${input.chequeId}`);
    const digits = (count: number): string =>
      Array.from({ length: count }, () => Math.floor(rng() * 10)).join('');

    const amountMajor = 1_000 + Math.floor(rng() * 49_000);
    const amountMinor = Math.floor(rng() * 100);
    const numericAmount = `${amountMajor}.${String(amountMinor).padStart(2, '0')}`;

    const issue = new Date(Date.UTC(2026, Math.floor(rng() * 6), 1 + Math.floor(rng() * 27)));
    const due = new Date(issue.getTime() + (15 + Math.floor(rng() * 75)) * 86_400_000);

    const banks = ['مصرف الراجحي', 'البنك الأهلي السعودي', 'بنك الرياض', 'البنك السعودي الفرنسي'];
    const drawers = ['مؤسسة النخبة للتجارة', 'شركة الأفق المحدودة', 'خالد العتيبي', 'أحمد بن سالم'];

    const field = <T>(
      value: T | null,
      confidence: number,
      rawText?: string,
    ): ExtractedField<T> => ({
      value,
      confidence: Number(confidence.toFixed(3)),
      ...(rawText === undefined ? {} : { rawText }),
    });

    const fields: ChequeExtractedFields = {
      chequeNumber: field(digits(8), 0.9 + rng() * 0.09),
      numericAmount: field(numericAmount, 0.88 + rng() * 0.11),
      // The written amount is the classic weak field on real cheques.
      writtenAmount: field(
        `فقط ${amountMajor} ريال و${amountMinor} هللة لا غير`,
        0.55 + rng() * 0.2,
      ),
      currency: field(input.expectedCurrency ?? 'USD', 0.97),
      issueDate: field(issue.toISOString().slice(0, 10), 0.8 + rng() * 0.15),
      dueDate: field(due.toISOString().slice(0, 10), 0.82 + rng() * 0.15),
      drawerName: field(pick(drawers, rng), 0.7 + rng() * 0.25),
      payeeName: field(pick(drawers, rng), 0.6 + rng() * 0.3),
      bankName: field(pick(banks, rng), 0.85 + rng() * 0.12),
      // Deliberately missing sometimes, so the review screen's empty state is exercised.
      bankBranch:
        rng() > 0.4 ? field<string>('الفرع الرئيسي', 0.5 + rng() * 0.3) : field<string>(null, 0),
      accountNumber: field(digits(12), 0.75 + rng() * 0.2),
      micr: field(`⑈${digits(8)}⑈ ⑆${digits(9)}⑆`, 0.9 + rng() * 0.09),
      signatureDetected: field(rng() > 0.15, 0.8 + rng() * 0.15),
    };

    return {
      provider: this.name,
      providerRequestId: createHash('sha256')
        .update(`${this.options.seed}:${input.chequeId}:${startedAt}`)
        .digest('hex')
        .slice(0, 32),
      fields,
      overallConfidence: computeOverallConfidence(fields),
      processingTimeMs: Date.now() - startedAt,
      raw: {
        provider: 'mock',
        note: 'Synthetic extraction. No real OCR was performed.',
        imageCount: input.images.length,
        sides: input.images.map((image) => image.side),
      },
    };
  }
}

function pick<T>(values: readonly T[], rng: () => number): T {
  const item = values[Math.floor(rng() * values.length)];
  // `values` is never empty at the call sites, but keep the type honest.
  return item ?? (values[0] as T);
}

/** Small deterministic PRNG (mulberry32) seeded from a string. */
function createSeededRandom(seed: string): () => number {
  const hash = createHash('sha256').update(seed).digest();
  let state = hash.readUInt32LE(0);
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
