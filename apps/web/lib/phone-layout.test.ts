import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The dashboard on a phone.
 *
 * Measured at 375 pixels: the cheque list showed three of seven columns with
 * the amount clipped; every field zoomed Safari in on tap; numbers in a fact
 * list sat against the far edge while Arabic values sat against their label;
 * the search box spent its width on a keyboard shortcut.
 */
const read = (path: string) => readFileSync(join(__dirname, '..', path), 'utf8');

describe('phone layout', () => {
  it('lists cheques as cards below md and keeps the table above it', () => {
    const table = read('components/cheque-table.tsx');
    expect(table).toMatch(/<ul className="[^"]*md:hidden"/);
    expect(table).toMatch(/<div className="hidden md:block">\{table\}<\/div>/);
  });

  it('keeps fields at 16px on small screens so Safari does not zoom', () => {
    const css = read('app/globals.css');
    expect(css).toMatch(
      /@media \(max-width: 639\.98px\)\s*\{\s*input:not\(\[type='checkbox'\]\):not\(\[type='radio'\]\),\s*select,\s*textarea\s*\{\s*font-size: 16px;/,
    );
  });

  it('isolates an identifier inside the value instead of flipping the whole cell', () => {
    const grid = read('components/fact-grid.tsx');
    expect(grid).toMatch(/<bdi dir="ltr"/);
    expect(grid).not.toMatch(/dir=\{fact\.ltr \? 'ltr' : undefined\}/);
  });

  it('drops the keyboard shortcut from the search box on a phone', () => {
    expect(read('components/top-bar.tsx')).toMatch(/<kbd className="[^"]*hidden[^"]*sm:block/);
  });

  it('turns every other table into cards below md', () => {
    const table = read('components/data-table.tsx');
    expect(table).toMatch(/<ul className="[^"]*md:hidden"/);
    expect(table).toMatch(/cards \? 'hidden md:block' : ''/);
    expect(read('components/cheque-table.tsx')).toMatch(/mobileCards=\{false\}/);
  });

  it('shows the audit trail as cards and the report tabs on their own row', () => {
    const audit = read('app/(app)/audit/page.tsx');
    expect(audit).toMatch(/<ul className="[^"]*md:hidden"/);
    expect(audit).toMatch(/<div className="hidden overflow-auto md:block">/);
    expect(read('app/(app)/reports/page.tsx')).toMatch(/w-full min-w-0 sm:w-auto sm:flex-1/);
  });
});
