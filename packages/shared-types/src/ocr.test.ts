import { describe, expect, it } from 'vitest';

import {
  CHEQUE_EXTRACTED_FIELD_NAMES,
  computeOverallConfidence,
  isLowConfidence,
  type ChequeExtractedFields,
} from './ocr.js';

function buildFields(overrides: Partial<ChequeExtractedFields> = {}): ChequeExtractedFields {
  const base = Object.fromEntries(
    CHEQUE_EXTRACTED_FIELD_NAMES.map((name) => [name, { value: null, confidence: 0 }]),
  ) as unknown as ChequeExtractedFields;
  return { ...base, ...overrides };
}

describe('ocr helpers', () => {
  it('marks empty or low confidence fields', () => {
    expect(isLowConfidence({ value: null, confidence: 0.99 })).toBe(true);
    expect(isLowConfidence({ value: 'x', confidence: 0.5 })).toBe(true);
    expect(isLowConfidence({ value: 'x', confidence: 0.9 })).toBe(false);
  });

  it('averages confidence over populated fields only', () => {
    const fields = buildFields({
      chequeNumber: { value: '123', confidence: 0.9 },
      numericAmount: { value: '100.00', confidence: 0.7 },
    });
    expect(computeOverallConfidence(fields)).toBe(0.8);
  });

  it('returns zero when nothing was extracted', () => {
    expect(computeOverallConfidence(buildFields())).toBe(0);
  });
});
