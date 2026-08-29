/**
 * Client-side capture quality gate.
 *
 * A cheque photo that is too small, too heavy or the wrong shape wastes an
 * upload and an OCR call, so it is rejected before either happens.
 */

export interface CaptureQualityInput {
  width: number;
  height: number;
  fileSize: number;
}

export type QualityIssue = 'TOO_SMALL' | 'TOO_LARGE' | 'WRONG_ASPECT';

export interface QualityResult {
  ok: boolean;
  issues: QualityIssue[];
  /** Translation keys for the issues, ready to show to the user. */
  messageKeys: string[];
}

export const MIN_WIDTH = 1000;
export const MIN_HEIGHT = 500;
export const MAX_FILE_SIZE = 10 * 1024 * 1024;
/** Cheques are wide: roughly 2:1, tolerated between 1.4:1 and 3.2:1. */
export const MIN_ASPECT = 1.4;
export const MAX_ASPECT = 3.2;

const MESSAGE_KEYS: Record<QualityIssue, string> = {
  TOO_SMALL: 'capture.qualityLow',
  TOO_LARGE: 'errors.PAYLOAD_TOO_LARGE',
  WRONG_ASPECT: 'capture.qualityBlurry',
};

export function checkCaptureQuality(input: CaptureQualityInput): QualityResult {
  const issues: QualityIssue[] = [];

  if (input.width < MIN_WIDTH || input.height < MIN_HEIGHT) issues.push('TOO_SMALL');
  if (input.fileSize > MAX_FILE_SIZE) issues.push('TOO_LARGE');

  const aspect = input.height === 0 ? 0 : input.width / input.height;
  if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) issues.push('WRONG_ASPECT');

  return {
    ok: issues.length === 0,
    issues,
    messageKeys: issues.map((issue) => MESSAGE_KEYS[issue]),
  };
}
