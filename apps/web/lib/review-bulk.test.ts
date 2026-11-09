import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The review queue receives several cheques at once.
 *
 * It listed cheques without selection, so a customer's batch of new cheques
 * had to be received one cheque page at a time, while the main list could do
 * all of them in one action.
 */
const page = readFileSync(
  join(__dirname, '..', 'app', '(app)', 'cheques', 'review', 'page.tsx'),
  'utf8',
);

describe('the review queue', () => {
  it('lets the reader select its cheques', () => {
    expect(page).toMatch(/<ChequeTable\s+cheques=\{query\.data\.data\}\s+selection=\{\{/);
  });

  it('offers receiving them all, as its first action', () => {
    expect(page).toMatch(/<BulkActionBar[\s\S]*?initialAction="RECEIVE"/);
  });
});
