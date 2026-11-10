/**
 * The cheque import's reading of spreadsheets: what each cell is taken to
 * mean. A wrong guess here is a wrong amount or a wrong due date written
 * into the books, so every format the import accepts is pinned.
 */
import { deflateRawSync } from 'node:zlib';

import { describe, expect, it } from 'vitest';

import {
  detectColumns,
  parseAmount,
  parseChequeSheet,
  parseCurrency,
  parseDirection,
  parseDueDate,
} from './cheque-import';
import { parseDelimited, readXlsx } from './spreadsheet';

describe('parseAmount', () => {
  it('reads plain, grouped, decimal-comma and Arabic-digit amounts', () => {
    expect(parseAmount('1500')).toBe('1500.00');
    expect(parseAmount('1,500.50')).toBe('1500.50');
    expect(parseAmount('1.500,50')).toBe('1500.50');
    expect(parseAmount('١٬٥٠٠٫٢٥')).toBe('1500.25');
    expect(parseAmount('1500 ₪')).toBe('1500.00');
  });

  it('refuses what is not an amount', () => {
    expect(parseAmount('')).toBeNull();
    expect(parseAmount('ألف')).toBeNull();
  });
});

describe('parseDueDate', () => {
  it('reads ISO dates and day-first dates', () => {
    expect(parseDueDate('2026-11-20')).toBe('2026-11-20');
    expect(parseDueDate('20/11/2026')).toBe('2026-11-20');
    // Day first, as written in the region: the 3rd of April, not March 4th.
    expect(parseDueDate('03/04/2026')).toBe('2026-04-03');
    expect(parseDueDate('3-4-26')).toBe('2026-04-03');
    expect(parseDueDate('٢٠/١١/٢٠٢٦')).toBe('2026-11-20');
  });

  it('reads an Excel date serial', () => {
    // 46346 is 2026-11-20 in Excel's 1900 date system.
    expect(parseDueDate('46346')).toBe('2026-11-20');
  });

  it('refuses impossible dates and stray numbers', () => {
    expect(parseDueDate('31/02/2026')).toBeNull();
    expect(parseDueDate('1500')).toBeNull();
    expect(parseDueDate('غدًا')).toBeNull();
  });
});

describe('currency and direction words', () => {
  it('maps symbols and Arabic names to codes', () => {
    expect(parseCurrency('₪')).toBe('ILS');
    expect(parseCurrency('شيكل')).toBe('ILS');
    expect(parseCurrency('دولار')).toBe('USD');
    expect(parseCurrency('jod')).toBe('JOD');
    expect(parseCurrency('عملة')).toBeNull();
  });

  it('reads وارد and صادر in either language', () => {
    expect(parseDirection('وارد')).toBe('INCOMING');
    expect(parseDirection('Outgoing')).toBe('OUTGOING');
    expect(parseDirection('شيك')).toBeNull();
  });
});

describe('detectColumns', () => {
  it('finds the columns by Arabic or English headers, hamza or not', () => {
    expect(
      detectColumns(['رقم الشيك', 'المبلغ', 'تاريخ الإستحقاق', 'البنك', 'الجهة', 'العمله']),
    ).toEqual({ chequeNumber: 0, amount: 1, dueDate: 2, bank: 3, contact: 4, currency: 5 });
    expect(detectColumns(['Cheque No', 'Amount', 'Due Date'])).toEqual({
      chequeNumber: 0,
      amount: 1,
      dueDate: 2,
    });
  });
});

describe('parseChequeSheet', () => {
  const defaults = { currency: 'ILS', direction: 'INCOMING' as const };

  it('reads rows, falling back to the defaults, and marks what is wrong', () => {
    const parsed = parseChequeSheet(
      [
        ['رقم الشيك', 'المبلغ', 'تاريخ الاستحقاق', 'العملة', 'النوع'],
        ['1001', '1,200', '15/12/2026', '', ''],
        ['1002', 'abc', '2026-12-20', 'USD', 'صادر'],
        [],
        ['1001', '50', '2026-12-21', '', ''],
      ],
      defaults,
    );
    expect(parsed.missing).toEqual([]);
    expect(parsed.rows).toHaveLength(3);
    expect(parsed.rows[0]).toMatchObject({
      line: 2,
      chequeNumber: '1001',
      amount: '1200.00',
      dueDate: '2026-12-15',
      currency: 'ILS',
      direction: 'INCOMING',
      errors: [],
    });
    expect(parsed.rows[1]).toMatchObject({ direction: 'OUTGOING', currency: 'USD' });
    expect(parsed.rows[1]!.errors).toEqual(['import.error.amount']);
    // Line numbers skip the blank row, as the spreadsheet does.
    expect(parsed.rows[2]).toMatchObject({ line: 5, errors: ['import.error.repeated'] });
  });

  it('names the required columns a sheet is missing', () => {
    expect(parseChequeSheet([['الاسم', 'البنك']], defaults).missing).toEqual([
      'chequeNumber',
      'amount',
      'dueDate',
    ]);
  });
});

describe('parseDelimited', () => {
  it('reads tab-separated rows pasted from Excel', () => {
    expect(parseDelimited('رقم\tالمبلغ\n1\t100\n')).toEqual([
      ['رقم', 'المبلغ'],
      ['1', '100'],
    ]);
  });

  it('reads quoted CSV fields holding commas and quotes', () => {
    expect(parseDelimited('\uFEFFa,b\n"1,5","say ""hi"""\r\n')).toEqual([
      ['a', 'b'],
      ['1,5', 'say "hi"'],
    ]);
  });
});

/** A minimal .xlsx: an uncompressed zip with a sheet and its shared strings. */
function storedZip(files: Record<string, string>, deflate = false): ArrayBuffer {
  const encoder = new TextEncoder();
  const chunks: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const plain = encoder.encode(content);
    // Excel itself deflates every entry; method 8 is what a real file carries.
    const data = deflate ? new Uint8Array(deflateRawSync(plain)) : plain;
    const local = new Uint8Array(30 + nameBytes.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    const entry = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(entry.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, deflate ? 8 : 0, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, plain.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    entry.set(nameBytes, 46);
    chunks.push(local, data);
    central.push(entry);
    offset += local.length + data.length;
  }
  const centralSize = central.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const all = [...chunks, ...central, end];
  const out = new Uint8Array(all.reduce((n, c) => n + c.length, 0));
  let at = 0;
  for (const part of all) {
    out.set(part, at);
    at += part.length;
  }
  return out.buffer;
}

describe('readXlsx', () => {
  it('reads shared strings, numbers, inline strings and skipped cells', async () => {
    const file = storedZip({
      'xl/sharedStrings.xml':
        '<sst><si><t>رقم الشيك</t></si><si><t>المبلغ</t></si><si><r><t>بنك </t></r><r><t>فلسطين</t></r></si></sst>',
      'xl/worksheets/sheet1.xml':
        '<worksheet><sheetData>' +
        '<row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c></row>' +
        '<row r="3"><c r="A3"><v>1001</v></c><c r="B3"><v>1500.5</v></c><c r="D3" t="s"><v>2</v></c></row>' +
        '<row r="4"><c r="A4" t="inlineStr"><is><t>A&amp;B</t></is></c></row>' +
        '</sheetData></worksheet>',
    });
    expect(await readXlsx(file)).toEqual([
      ['رقم الشيك', 'المبلغ'],
      [],
      ['1001', '1500.5', '', 'بنك فلسطين'],
      ['A&B'],
    ]);
  });

  it('inflates deflated entries, as Excel writes them', async () => {
    const file = storedZip(
      {
        'xl/worksheets/sheet1.xml':
          '<worksheet><sheetData><row r="1"><c r="A1" t="inlineStr"><is><t>تاريخ الاستحقاق</t></is></c><c r="B1"><v>46346</v></c></row></sheetData></worksheet>',
      },
      true,
    );
    expect(await readXlsx(file)).toEqual([['تاريخ الاستحقاق', '46346']]);
  });
});
