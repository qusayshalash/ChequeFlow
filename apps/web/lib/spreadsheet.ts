/**
 * Reading a spreadsheet into rows of text, for the cheque import.
 *
 * An .xlsx file is a zip of XML files, and the browser already inflates zip
 * entries (`DecompressionStream`), so the first sheet is read here rather
 * than through a spreadsheet library: the one the ecosystem reaches for
 * stopped publishing fixes to npm, and this app keeps its dependencies few.
 * What it reads is deliberately narrow: the first sheet's cell values, as
 * text. Formulas arrive as their last computed value, which is what Excel
 * stores beside them; styling is ignored.
 */

/** Rows of cells, as text. Empty trailing cells are trimmed. */
export type Sheet = string[][];

// ── delimited text (CSV, or rows pasted from Excel) ───────────────────────

/**
 * Splits pasted or CSV text into rows.
 *
 * Rows copied out of Excel arrive tab-separated; a CSV saved from it uses
 * commas, or semicolons where the decimal mark is a comma. The separator is
 * whichever of the three the first line uses most. Quotes follow RFC 4180,
 * so a quoted field may hold the separator, a doubled quote, or a newline.
 */
export function parseDelimited(text: string): Sheet {
  const clean = text.replace(/^\uFEFF/, '');
  const firstLine = clean.split(/\r?\n/, 1)[0] ?? '';
  const counts = ['\t', ',', ';'].map((sep) => ({ sep, n: firstLine.split(sep).length - 1 }));
  const sep = counts.sort((a, b) => b.n - a.n)[0]!.n > 0 ? counts[0]!.sep : ',';

  const rows: Sheet = [];
  let row: string[] = [];
  let field = '';
  let quoted = false;
  for (let i = 0; i < clean.length; i++) {
    const ch = clean[i]!;
    if (quoted) {
      if (ch === '"') {
        if (clean[i + 1] === '"') {
          field += '"';
          i++;
        } else quoted = false;
      } else field += ch;
      continue;
    }
    if (ch === '"' && field === '') quoted = true;
    else if (ch === sep) {
      row.push(field);
      field = '';
    } else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && clean[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += ch;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return tidy(rows);
}

// ── xlsx ───────────────────────────────────────────────────────────────────

interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  localOffset: number;
}

function zipEntries(bytes: Uint8Array): ZipEntry[] {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  // The end-of-central-directory record sits in the last 64 KiB + 22 bytes.
  let eocd = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (view.getUint32(i, true) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('not-a-zip');

  const count = view.getUint16(eocd + 10, true);
  let offset = view.getUint32(eocd + 16, true);
  const decoder = new TextDecoder();
  const entries: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (view.getUint32(offset, true) !== 0x02014b50) throw new Error('bad-zip');
    const nameLength = view.getUint16(offset + 28, true);
    const extraLength = view.getUint16(offset + 30, true);
    const commentLength = view.getUint16(offset + 32, true);
    entries.push({
      method: view.getUint16(offset + 10, true),
      compressedSize: view.getUint32(offset + 20, true),
      localOffset: view.getUint32(offset + 42, true),
      name: decoder.decode(bytes.subarray(offset + 46, offset + 46 + nameLength)),
    });
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

async function readEntry(bytes: Uint8Array, entry: ZipEntry): Promise<string> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const at = entry.localOffset;
  if (view.getUint32(at, true) !== 0x04034b50) throw new Error('bad-zip');
  const start = at + 30 + view.getUint16(at + 26, true) + view.getUint16(at + 28, true);
  const data = bytes.subarray(start, start + entry.compressedSize);
  if (entry.method === 0) return new TextDecoder().decode(data);
  if (entry.method !== 8) throw new Error('unsupported-compression');
  // Copied into a fresh buffer: a view onto a larger one is not a BlobPart.
  const stream = new Blob([new Uint8Array(data)])
    .stream()
    .pipeThrough(new DecompressionStream('deflate-raw'));
  return new Response(stream).text();
}

function decodeXml(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code: string) => String.fromCodePoint(parseInt(code, 16)))
    .replace(/&amp;/g, '&');
}

/** All the text runs inside one element, joined: rich text splits a cell into several. */
function textRuns(xml: string): string {
  return [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1]!)).join('');
}

function columnIndex(ref: string): number {
  const letters = /^[A-Z]+/.exec(ref)?.[0] ?? 'A';
  let index = 0;
  for (const letter of letters) index = index * 26 + (letter.charCodeAt(0) - 64);
  return index - 1;
}

function attribute(attrs: string, name: string): string | undefined {
  return new RegExp(`\\b${name}="([^"]*)"`).exec(attrs)?.[1];
}

/** The first worksheet of an .xlsx file, as rows of text. */
export async function readXlsx(buffer: ArrayBuffer): Promise<Sheet> {
  const bytes = new Uint8Array(buffer);
  const entries = zipEntries(bytes);
  const byName = new Map(entries.map((entry) => [entry.name, entry]));

  const sheetEntry =
    byName.get('xl/worksheets/sheet1.xml') ??
    entries
      .filter((entry) => /^xl\/worksheets\/sheet\d+\.xml$/.test(entry.name))
      .sort((a, b) => a.name.localeCompare(b.name, 'en', { numeric: true }))[0];
  if (!sheetEntry) throw new Error('no-sheet');

  const shared: string[] = [];
  const sharedEntry = byName.get('xl/sharedStrings.xml');
  if (sharedEntry) {
    const xml = await readEntry(bytes, sharedEntry);
    for (const match of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) shared.push(textRuns(match[1]!));
  }

  const xml = await readEntry(bytes, sheetEntry);
  const rows: Sheet = [];
  for (const rowMatch of xml.matchAll(/<row\b([^>]*?)(?:\/>|>([\s\S]*?)<\/row>)/g)) {
    const rowNumber = Number(attribute(rowMatch[1]!, 'r') ?? rows.length + 1);
    const cells: string[] = [];
    let next = 0;
    for (const cell of (rowMatch[2] ?? '').matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
      const attrs = cell[1]!;
      const body = cell[2] ?? '';
      const ref = attribute(attrs, 'r');
      const index = ref ? columnIndex(ref) : next;
      next = index + 1;
      const type = attribute(attrs, 't');
      const raw = /<v>([\s\S]*?)<\/v>/.exec(body)?.[1];
      let value = '';
      if (type === 's') value = shared[Number(raw)] ?? '';
      else if (type === 'inlineStr') value = textRuns(body);
      else if (raw !== undefined) value = decodeXml(raw);
      cells[index] = value;
    }
    // Rows Excel skipped (empty ones) keep their place, so line numbers match.
    while (rows.length < rowNumber - 1) rows.push([]);
    rows.push(Array.from(cells, (value) => value ?? ''));
  }
  return tidy(rows);
}

/** Trims cells and drops blank rows at the end. */
function tidy(rows: Sheet): Sheet {
  const out = rows.map((row) => {
    const cells = row.map((cell) => cell.trim());
    while (cells.length > 0 && cells[cells.length - 1] === '') cells.pop();
    return cells;
  });
  while (out.length > 0 && out[out.length - 1]!.length === 0) out.pop();
  return out;
}
