import { csvField, toCsv } from './csv';
import { ExportService } from './export.service';

describe('csvField', () => {
  it('leaves ordinary values alone', () => {
    expect(csvField('12345')).toBe('12345');
    expect(csvField('شركة النور')).toBe('شركة النور');
  });

  it('renders null and undefined as an empty field', () => {
    expect(csvField(null)).toBe('');
    expect(csvField(undefined)).toBe('');
  });

  it('quotes fields containing a separator or newline', () => {
    expect(csvField('Smith, John')).toBe('"Smith, John"');
    expect(csvField('line1\nline2')).toBe('"line1\nline2"');
  });

  it('doubles embedded quotes', () => {
    expect(csvField('He said "no"')).toBe('"He said ""no"""');
  });

  it('neutralises spreadsheet formulas', () => {
    // Cheque data is attacker-influenced: a drawer name or a note can be
    // anything. Without the leading apostrophe these open as live formulas in
    // Excel and Google Sheets when the exported file is opened.
    expect(csvField('=1+1')).toBe("'=1+1");
    expect(csvField('+41 555')).toBe("'+41 555");
    expect(csvField('-1')).toBe("'-1");
    expect(csvField('@SUM(A1)')).toBe("'@SUM(A1)");
  });

  it('quotes a formula that also contains a comma', () => {
    expect(csvField('=HYPERLINK("http://x","click")')).toBe(
      '"\'=HYPERLINK(""http://x"",""click"")"',
    );
  });
});

const BOM = '\uFEFF';

describe('toCsv', () => {
  it('writes a BOM, CRLF line endings and a trailing newline', () => {
    const csv = toCsv(['a', 'b'], [['1', '2']]);
    // The BOM is what makes Excel on Windows read the file as UTF-8 instead of
    // the local codepage, which is the difference between Arabic names and
    // mojibake.
    expect(csv.startsWith(BOM)).toBe(true);
    expect(csv).toBe(`${BOM}a,b\r\n1,2\r\n`);
  });

  it('handles an empty row set', () => {
    expect(toCsv(['a'], [])).toBe(`${BOM}a\r\n`);
  });
});

describe('ExportService', () => {
  const service = new ExportService();

  const cheque = {
    id: 'c1',
    direction: 'INCOMING' as const,
    chequeNumber: '900001',
    amount: '1500.00',
    currency: 'ILS',
    dueDate: '2026-09-30',
    status: 'IN_HAND' as const,
    isOverdue: false,
    drawerName: 'شركة النور',
    bankName: 'بنك الاختبار',
    originalSourceName: null,
    currentRecipientName: null,
    currentLocationName: null,
    branchName: null,
    createdAt: '2026-08-29T10:00:00.000Z',
  };

  it('writes amounts as bare decimals a spreadsheet can add up', () => {
    const csv = service.chequesToCsv([cheque], 'en');
    // No thousands separator and no currency symbol: the currency has its own
    // column, and "ILS 1,500.00" would not parse as a number.
    expect(csv).toContain('1500.00');
    expect(csv).not.toContain('1,500.00');
    expect(csv).toContain('ILS');
  });

  it('says in the file itself when the export is partial', () => {
    // Whoever opens the spreadsheet next week never sees the HTTP headers, so
    // a truncated financial export has to admit it in its own last row.
    const csv = service.chequesToCsv([cheque], 'en', {
      truncated: { limit: 5000, total: 8123 },
    });
    expect(csv).toContain('5000');
    expect(csv).toContain('8123');
  });

  it('says nothing extra when the export is complete', () => {
    const csv = service.chequesToCsv([cheque], 'en');
    expect(csv.trimEnd().split('\r\n')).toHaveLength(2);
  });
});
