import { ApiErrorCode, OcrStatus } from '@cheque-flow/shared-types';
import { toMoney } from '@cheque-flow/database';

import { OcrService } from './ocr.service';
import type { AppError } from '../../common/errors/app-error';
import type { DuplicateDetectorService } from '../cheques/duplicate-detector.service';
import type { RequestUser } from '../../common/types/request-user';
import type { ReviewChequeInput } from '@cheque-flow/validation';

/**
 * Confirming a photographed cheque checks whether it is already on file.
 *
 * The capture screen creates the record before anything has been read: a
 * placeholder amount of 1.00 under a `TMP-` number, deliberately exempt from
 * duplicate detection, because a photograph of a cheque already recorded is a
 * re-photograph and not a second cheque. `cheque-upload.ts` says the check
 * "runs again after review, on the real values" — and it did not run at all.
 *
 * So a recorded cheque photographed a second time was filed twice in silence.
 * It happened here: 20000013 was photographed twice within two hours and
 * stored twice, identical in number, amount and due date, with nothing shown
 * to the person confirming the second one.
 */
describe('confirming a reviewed cheque', () => {
  const user = { id: 'user-1', organizationId: 'org-1' } as RequestUser;

  /** The cheque as the capture screen left it: a placeholder under a TMP number. */
  const stored = {
    id: 'cheque-1',
    organizationId: 'org-1',
    chequeNumber: 'TMP-63146975',
    amount: toMoney('1.00'),
    dueDate: new Date('2026-09-09T00:00:00.000Z'),
    bankId: null,
    version: 1,
    ocrStatus: OcrStatus.COMPLETED,
  };

  const input = {
    confirmed: { chequeNumber: '20000013', amount: '9000.00', dueDate: '2026-07-10' },
    rejectedFields: [],
    version: 1,
  } as unknown as ReviewChequeInput;

  function build(matches: unknown[]) {
    const asked: unknown[] = [];
    const detector = {
      findByBusinessKey: (key: unknown) => {
        asked.push(key);
        return Promise.resolve(matches);
      },
    } as unknown as DuplicateDetectorService;

    const prisma = {
      db: {
        cheque: { findFirst: () => Promise.resolve(stored) },
        $transaction: async (run: (tx: unknown) => Promise<unknown>) =>
          run({
            cheque: { update: () => Promise.resolve(stored) },
            ocrExtraction: { updateMany: () => Promise.resolve({ count: 0 }) },
          }),
      },
    };

    const audit = { recordWithin: () => Promise.resolve(undefined) };
    const actions = { execute: () => Promise.resolve({ id: 'cheque-1', reviewed: true }) };

    const service = new OcrService(
      {} as never,
      prisma as never,
      audit as never,
      {} as never,
      actions as never,
      detector,
      {} as never,
    );

    return { service, asked };
  }

  it('checks the values the reviewer confirmed, not the placeholder', async () => {
    const { service, asked } = build([]);
    await service.review(user, 'cheque-1', input);

    // Checking `TMP-63146975` for 1.00 would match nothing, ever — which is
    // exactly why the omission was invisible.
    expect(asked).toEqual([
      {
        organizationId: 'org-1',
        bankId: null,
        chequeNumber: '20000013',
        amount: '9000.00',
        dueDate: '2026-07-10',
        excludeChequeId: 'cheque-1',
      },
    ]);
  });

  it('refuses to file a cheque that is already recorded', async () => {
    const { service } = build([
      {
        chequeId: 'cheque-earlier',
        chequeNumber: '20000013',
        amount: '9000.00',
        dueDate: '2026-07-10',
        status: 'IN_HAND',
        reason: 'BUSINESS_KEY',
      },
    ]);

    await expect(service.review(user, 'cheque-1', input)).rejects.toMatchObject({
      code: ApiErrorCode.DUPLICATE_CHEQUE,
    });
  });

  it('names the cheque it matched, so the reviewer can decide', async () => {
    const { service } = build([
      {
        chequeId: 'cheque-earlier',
        chequeNumber: '20000013',
        amount: '9000.00',
        dueDate: '2026-07-10',
        status: 'IN_HAND',
        reason: 'BUSINESS_KEY',
      },
    ]);

    const caught = await service.review(user, 'cheque-1', input).catch((error: unknown) => error);
    const details = (caught as AppError).details as { duplicates?: Array<{ chequeNumber: string }> };
    // A warning panel with nothing in it asks the reader to decide about a
    // cheque it will not name.
    expect(details.duplicates?.[0]?.chequeNumber).toBe('20000013');
  });

  it('files it anyway once the reviewer says so', async () => {
    // A re-issued cheque can legitimately repeat a number, and only the person
    // holding it knows which this is.
    const { service } = build([{ chequeId: 'cheque-earlier', reason: 'BUSINESS_KEY' }]);
    await expect(
      service.review(user, 'cheque-1', input, {}, { allowDuplicate: true }),
    ).resolves.toBeDefined();
  });

  it('falls back to the stored values for whatever the reviewer left alone', async () => {
    const { service, asked } = build([]);
    await service.review(
      user,
      'cheque-1',
      { ...input, confirmed: { chequeNumber: '20000013' } },
    );

    expect(asked[0]).toMatchObject({ amount: '1.00', dueDate: '2026-09-09' });
  });
});
