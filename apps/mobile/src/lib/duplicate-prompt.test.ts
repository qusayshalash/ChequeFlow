import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Both screens that can produce a duplicate ask about it.
 *
 * Creating a cheque always asked; editing one never did, because the API never
 * checked an edit. Now that it does, the edit screen has to be able to answer:
 * without this, a refused edit would surface as a bare "save failed" with no
 * way to say "yes, both cheques are real".
 *
 * And the edit screen had been showing the duplicate warning in the wrong
 * place — above the reason field for changing a reviewed cheque's amount,
 * which has nothing to do with duplicates.
 */

const APP = join(process.cwd(), 'app', '(app)', 'cheques');
const EDIT = readFileSync(join(APP, '[id]', 'edit.tsx'), 'utf8');
const CREATE = readFileSync(join(APP, 'new.tsx'), 'utf8');

describe('a duplicate on create or edit', () => {
  for (const [name, screen] of [
    ['create', CREATE],
    ['edit', EDIT],
  ] as const) {
    it(`is asked about on ${name}, by the shared prompt`, () => {
      expect(screen).toContain("error.code === 'DUPLICATE_CHEQUE'");
      expect(screen).toContain('<DuplicatePrompt');
      // Confirming sends the same request again with the duplicate allowed.
      expect(screen).toContain('mutation.mutate(true)');
    });
  }

  it('lets an edit be saved once the person confirms', () => {
    expect(EDIT).toContain('api.updateCheque(id, validated.data, allowDuplicate)');
  });

  it('warns about the right thing above the reason field', () => {
    expect(EDIT).not.toContain("t('cheque.duplicateWarning')");
    expect(EDIT).toContain("t('cheque.amountAfterReviewHint')");
  });
});
