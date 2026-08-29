import { describe, expect, it } from 'vitest';
import { $Enums } from '@prisma/client';

import {
  ChequeDirection,
  ChequeEventType,
  ChequeImageSide,
  ChequeStatus,
  ContactType,
  LocationType,
  OcrStatus,
  ReminderChannel,
  ReminderStatus,
  ReminderType,
  UserStatus,
} from '@cheque-flow/shared-types';

/**
 * The domain enums live in `@cheque-flow/shared-types` and are mirrored in the
 * Prisma schema. This test fails loudly if the two ever drift apart.
 */
const pairs: Array<[string, Record<string, string>, Record<string, string>]> = [
  ['ChequeDirection', ChequeDirection, $Enums.ChequeDirection],
  ['ChequeStatus', ChequeStatus, $Enums.ChequeStatus],
  ['ChequeEventType', ChequeEventType, $Enums.ChequeEventType],
  ['ContactType', ContactType, $Enums.ContactType],
  ['LocationType', LocationType, $Enums.LocationType],
  ['ChequeImageSide', ChequeImageSide, $Enums.ChequeImageSide],
  ['OcrStatus', OcrStatus, $Enums.OcrStatus],
  ['UserStatus', UserStatus, $Enums.UserStatus],
  ['ReminderType', ReminderType, $Enums.ReminderType],
  ['ReminderChannel', ReminderChannel, $Enums.ReminderChannel],
  ['ReminderStatus', ReminderStatus, $Enums.ReminderStatus],
];

describe('shared-types / prisma enum parity', () => {
  it.each(pairs)('%s matches the Prisma enum', (_name, shared, prisma) => {
    expect(Object.values(shared).sort()).toEqual(Object.values(prisma).sort());
  });
});
