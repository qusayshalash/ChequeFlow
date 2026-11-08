import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The roles table speaks to the person reading it.
 *
 * Each row showed the internal permission key (`cheque.create`) above its
 * name, the first column was headed "roles" over a list of permissions, and a
 * bare "yes" badge marked the ones the reader holds.
 */
const page = readFileSync(join(__dirname, '..', 'app', '(app)', 'roles', 'page.tsx'), 'utf8');

describe('the roles page', () => {
  it('does not print the internal permission key', () => {
    expect(page).not.toMatch(/<code[^>]*>\s*\{permission\}/);
  });

  it('heads the first column with what it lists', () => {
    expect(page).toContain("t('rolesPage.permission')");
  });

  it('says whose permission the badge marks', () => {
    expect(page).toMatch(/mine\.has\(permission\)[\s\S]*?t\('rolesPage\.youHave'\)/);
  });
});
