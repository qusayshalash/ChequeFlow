import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Two screens that printed everything, whether or not there was anything.
 *
 * Measured against one real book of 37 cheques: on the detail screen the
 * branch, the reference number, the recipient, the account number and the
 * purpose were empty on every single cheque, and nine or ten of its
 * twenty-three rows read "—" on a typical one. The form asked for eighteen
 * fields, five of which had never once been filled in.
 *
 * So the detail screen draws only the facts a cheque carries, and the form
 * asks the six questions every cheque answers. Neither hides anything: the
 * detail screen says how many fields are empty and opens them, and the form's
 * extra fields are one tap away — and open themselves when one of them fails
 * validation, because an error behind a closed panel is a save that fails for
 * no visible reason.
 */

const DETAIL = readFileSync(
  join(process.cwd(), 'app', '(app)', 'cheques', '[id]', 'index.tsx'),
  'utf8',
);
const FORM = readFileSync(join(process.cwd(), 'app', '(app)', 'cheques', 'new.tsx'), 'utf8');
const UI = readFileSync(join(process.cwd(), 'src', 'components', 'ui.tsx'), 'utf8');

describe('the cheque detail screen', () => {
  it('draws facts rather than a row per field', () => {
    expect(DETAIL).toContain('FactSection');
    // The old shape printed a row whether or not it held anything.
    expect(DETAIL).not.toMatch(/<InfoRow[^>]*\?\?\s*'—'/);
  });

  it('never prints a dash where a value would go', () => {
    expect(DETAIL).not.toContain("value={cheque.bankName ?? '—'}");
    expect(DETAIL).not.toContain("'—'");
  });

  it('says how many fields are empty, in every group', () => {
    const groups = [...DETAIL.matchAll(/<FactSection/g)].length;
    const counts = [...DETAIL.matchAll(/missingLabel=/g)].length;
    expect(groups).toBeGreaterThanOrEqual(4);
    // A group that hid its empties without saying so would be worse than the
    // dashes: the reader could not tell "no reference number" from "nobody
    // entered one".
    expect(counts).toBe(groups);
  });

  it('hides an empty fact and can show it again', () => {
    // The rule lives in one component, so it cannot drift per screen.
    expect(UI).toContain("fact.value !== null && fact.value !== ''");
    expect(UI).toMatch(/showEmpty\s*\?/);
  });
});

describe('the new cheque form', () => {
  it('asks the questions every cheque answers, and folds the rest away', () => {
    expect(FORM).toContain('MoreFields');
    const disclosureAt = FORM.indexOf('<MoreFields');
    for (const rare of ['referenceNumber', 'accountNumber', 'originalPayeeName', 'notes']) {
      expect(FORM.indexOf(`error('${rare}')`), `${rare} is still in the open`).toBeGreaterThan(
        disclosureAt,
      );
    }
  });

  it('keeps in the open what this book actually fills in', () => {
    // Counted, not assumed: the exchange rate was set on all 37 cheques, the
    // source on 26 and the location on 22.
    const disclosureAt = FORM.indexOf('<MoreFields');
    for (const common of ['exchangeRate', 'originalSourceId', 'currentLocationId', 'dueDate']) {
      expect(FORM.indexOf(`error('${common}')`), `${common} was folded away`).toBeLessThan(
        disclosureAt,
      );
    }
  });

  it('opens the fold when something inside it is wrong', () => {
    expect(FORM).toContain('forceOpen={EXTRA_FIELDS.some');
    // The list has to match the fields in the group, or a validation error
    // stays invisible behind a closed panel.
    const listed = FORM.slice(FORM.indexOf('const EXTRA_FIELDS'), FORM.indexOf('] as const'));
    const inGroup = FORM.slice(FORM.indexOf('<MoreFields'), FORM.indexOf('</MoreFields>'));
    for (const field of [...inGroup.matchAll(/error\('(\w+)'\)/g)].map((m) => m[1]!)) {
      expect(listed, `${field} is in the group but not in EXTRA_FIELDS`).toContain(`'${field}'`);
    }
  });
});
