import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { translate } from '@cheque-flow/localization';
import { AUDIT_ACTIONS, AUDIT_ENTITY_TYPES, auditActionKey } from '@cheque-flow/shared-types';
import { describe, expect, it } from 'vitest';

/**
 * The audit trail reads in words.
 *
 * It printed each action as its internal code (`auth.login.success`) and each
 * record as its table name (`cheque_image`), and filtered by typing a code.
 * The keys are built at run time, which the localization suite's scan of
 * literal keys cannot see, so every one is checked here instead.
 */
describe('audit names', () => {
  it.each(['ar', 'en'] as const)('names every action in %s', (locale) => {
    for (const action of AUDIT_ACTIONS) {
      expect(translate(locale, auditActionKey(action)), action).not.toBe(auditActionKey(action));
    }
  });

  it.each(['ar', 'en'] as const)('names every record kind in %s', (locale) => {
    for (const kind of AUDIT_ENTITY_TYPES) {
      expect(translate(locale, `auditEntity.${kind}`), kind).not.toBe(`auditEntity.${kind}`);
    }
  });

  it('filters by choosing a named action, not by typing a code', () => {
    const page = readFileSync(join(__dirname, '..', 'app', '(app)', 'audit', 'page.tsx'), 'utf8');
    expect(page).toMatch(/<select[\s\S]*?AUDIT_ACTIONS\.map/);
    expect(page).not.toMatch(/<span dir="ltr">\{row\.action\}<\/span>/);
  });
});
