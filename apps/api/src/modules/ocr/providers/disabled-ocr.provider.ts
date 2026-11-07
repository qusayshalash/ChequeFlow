import type {
  ChequeExtractionResult,
  OcrChequeInput,
  OcrProvider,
} from '@cheque-flow/shared-types';

export const DISABLED_OCR_PROVIDER_NAME = 'disabled';

/**
 * Stands in when an organization has chosen manual entry only.
 *
 * It reads nothing and invents nothing, unlike the mock. `OcrService` refuses
 * before calling it, so reaching `processCheque` is a bug and fails as one.
 */
export class DisabledOcrProvider implements OcrProvider {
  readonly name = DISABLED_OCR_PROVIDER_NAME;
  readonly needsImageBytes = false;

  processCheque(_input: OcrChequeInput): Promise<ChequeExtractionResult> {
    return Promise.reject(new Error('Cheque reading is turned off'));
  }
}
