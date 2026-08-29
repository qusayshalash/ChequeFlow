import { describe, expect, it } from 'vitest';

import { checkCaptureQuality } from './image-quality';

const good = { width: 2000, height: 900, fileSize: 1_200_000 };

describe('checkCaptureQuality', () => {
  it('accepts a well-framed cheque photo', () => {
    expect(checkCaptureQuality(good)).toMatchObject({ ok: true, issues: [] });
  });

  it('rejects a low resolution capture', () => {
    const result = checkCaptureQuality({ ...good, width: 600, height: 300 });
    expect(result.ok).toBe(false);
    expect(result.issues).toContain('TOO_SMALL');
  });

  it('rejects a file above the upload limit', () => {
    const result = checkCaptureQuality({ ...good, fileSize: 11 * 1024 * 1024 });
    expect(result.issues).toContain('TOO_LARGE');
  });

  it('rejects a portrait photo of a landscape cheque', () => {
    const result = checkCaptureQuality({ width: 900, height: 2000, fileSize: 500_000 });
    expect(result.issues).toContain('WRONG_ASPECT');
  });

  it('returns translation keys, not English text', () => {
    const result = checkCaptureQuality({ width: 100, height: 100, fileSize: 1 });
    expect(result.messageKeys.every((key) => key.includes('.'))).toBe(true);
  });

  it('does not divide by zero on a degenerate image', () => {
    expect(() => checkCaptureQuality({ width: 10, height: 0, fileSize: 1 })).not.toThrow();
  });
});
