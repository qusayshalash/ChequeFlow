import type { OcrProvider } from '@cheque-flow/shared-types';

import { OcrService } from './ocr.service';
import { DisabledOcrProvider } from './providers/disabled-ocr.provider';

/**
 * Turning reading off must leave the record alone.
 *
 * The ordinary path marks the cheque PROCESSING first and FAILED when the
 * provider refuses, so a server with reading off would have stamped every
 * cheque it was asked about with a failure nobody caused.
 */
describe('processing a cheque with reading turned off', () => {
  it('refuses without touching the database', async () => {
    const prisma = new Proxy(
      {},
      {
        get: () => {
          throw new Error('the database was touched');
        },
      },
    );
    const provider: OcrProvider = new DisabledOcrProvider();
    const service = new OcrService(
      provider,
      prisma as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await expect(service.process({} as never, 'any-cheque')).rejects.toMatchObject({
      status: 409,
      details: { reason: 'OCR_DISABLED' },
    });
  });
});
