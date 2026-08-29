import {
  CHEQUE_EXTRACTED_FIELD_NAMES,
  isLowConfidence,
  type OcrChequeInput,
} from '@cheque-flow/shared-types';

import { MockOcrProvider } from './mock-ocr.provider';

const input: OcrChequeInput = {
  chequeId: '11111111-1111-4111-8111-111111111111',
  organizationId: 'org-1',
  images: [{ side: 'FRONT', storageKey: 'k/front.jpg', mimeType: 'image/jpeg' }],
  expectedCurrency: 'USD',
};

describe('MockOcrProvider', () => {
  const provider = new MockOcrProvider({ latencyMs: 0, seed: 'test-seed' });

  it('returns every documented field with a confidence score', async () => {
    const result = await provider.processCheque(input);
    for (const name of CHEQUE_EXTRACTED_FIELD_NAMES) {
      const field = result.fields[name];
      expect(field).toBeDefined();
      expect(field.confidence).toBeGreaterThanOrEqual(0);
      expect(field.confidence).toBeLessThanOrEqual(1);
    }
  });

  it('is deterministic for the same cheque and seed', async () => {
    const a = await provider.processCheque(input);
    const b = await provider.processCheque(input);
    expect(b.fields).toEqual(a.fields);
  });

  it('produces different output for a different cheque', async () => {
    const other = await provider.processCheque({ ...input, chequeId: 'another-cheque-id' });
    const first = await provider.processCheque(input);
    expect(other.fields.chequeNumber.value).not.toBe(first.fields.chequeNumber.value);
  });

  it('emits an amount that parses as a decimal string', async () => {
    const result = await provider.processCheque(input);
    expect(result.fields.numericAmount.value).toMatch(/^\d+\.\d{2}$/);
  });

  it('leaves at least one field for the reviewer to verify', async () => {
    const result = await provider.processCheque(input);
    const lowConfidence = CHEQUE_EXTRACTED_FIELD_NAMES.filter((name) =>
      isLowConfidence(result.fields[name]),
    );
    expect(lowConfidence.length).toBeGreaterThan(0);
  });

  it('reports the currency the organization expects', async () => {
    const result = await provider.processCheque({ ...input, expectedCurrency: 'AED' });
    expect(result.fields.currency.value).toBe('AED');
  });

  it('never claims to have done real OCR', async () => {
    const result = await provider.processCheque(input);
    expect(JSON.stringify(result.raw)).toContain('No real OCR');
  });
});
