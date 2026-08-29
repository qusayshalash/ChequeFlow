import { Injectable } from '@nestjs/common';

import { translate, type Locale } from '@cheque-flow/localization';
import type { ChequeSummaryView } from '@cheque-flow/shared-types';

import { toCsv } from './csv';

/** Columns of the cheque export, in the order they appear in the file. */
const COLUMNS = [
  'cheque.number',
  'cheque.direction',
  'common.amount',
  'cheque.currency',
  'cheque.dueDate',
  'cheque.status',
  'cheque.overdue',
  'cheque.bank',
  'cheque.drawerName',
  'cheque.originalSource',
  'cheque.currentRecipient',
  'cheque.currentLocation',
  'cheque.branch',
  'common.createdAt',
] as const;

@Injectable()
export class ExportService {
  /**
   * Renders cheques as CSV in the requester's language.
   *
   * Amounts are written as plain decimal strings with no thousands separators
   * and no currency symbol — a spreadsheet must be able to parse them as
   * numbers, and the currency has its own column.
   */
  chequesToCsv(
    cheques: readonly ChequeSummaryView[],
    locale: Locale,
    options: { truncated?: { limit: number; total: number } } = {},
  ): string {
    const headers = COLUMNS.map((key) => translate(locale, key));

    const rows = cheques.map((cheque) => [
      cheque.chequeNumber,
      translate(locale, `direction.${cheque.direction}`),
      cheque.amount,
      cheque.currency,
      cheque.dueDate,
      translate(locale, `status.${cheque.status}`),
      translate(locale, cheque.isOverdue ? 'common.yes' : 'common.no'),
      cheque.bankName,
      cheque.drawerName,
      cheque.originalSourceName,
      cheque.currentRecipientName,
      cheque.currentLocationName,
      cheque.branchName,
      cheque.createdAt,
    ]);

    if (options.truncated) {
      // The warning goes in the file, not only in a header: whoever opens the
      // spreadsheet a week later never sees the HTTP response.
      rows.push([
        translate(locale, 'errors.exportTruncated', {
          limit: options.truncated.limit,
          total: options.truncated.total,
        }),
      ]);
    }

    return toCsv(headers, rows);
  }
}
