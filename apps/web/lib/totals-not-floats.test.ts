import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Totals on screen are summed as strings.
 *
 * The cash-flow totals on the dashboard and both report screens were added up
 * as JavaScript numbers and rounded with `toFixed(2)`, which is the float
 * arithmetic the rest of the system keeps money out of. The chart series stay
 * numbers: a line needs them, and a pixel cannot be off by a cent.
 */
const root = join(__dirname, '..', '..', '..');
const screens = [
  'apps/web/app/(app)/reports/page.tsx',
  'apps/web/app/(app)/dashboard/page.tsx',
  'apps/mobile/app/(app)/more/reports.tsx',
];

describe('screen totals', () => {
  it.each(screens)('%s does not round a float sum into an amount', (path) => {
    const source = readFileSync(join(root, path), 'utf8');
    expect(source).not.toMatch(/\.toFixed\(2\)/);
    // Exact sums: addMoney directly, or the shared projection, which sums
    // with it (the dashboard's forecast is shared with the phone).
    expect(source).toMatch(/addMoney\(|projectBalance\(/);
  });
});
