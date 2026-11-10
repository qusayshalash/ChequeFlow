import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The settings page lists the sidebar's management areas, each with a line
 * saying what it is for, looked up by its path. A section added to the
 * sidebar without that line would show its raw translation key on the page,
 * which no type check catches.
 */
const WEB = process.cwd();
const shell = readFileSync(join(WEB, 'components', 'app-shell.tsx'), 'utf8');
const list = shell.slice(shell.indexOf('export const SETTINGS_NAV'));
const hrefs = [...list.slice(0, list.indexOf('];')).matchAll(/href: '\/([^']+)'/g)]
  .map((match) => match[1] as string)
  .filter((href) => href !== 'settings');

const messages = (lang: string) =>
  JSON.parse(
    readFileSync(
      join(WEB, '..', '..', 'packages', 'localization', 'src', 'messages', `${lang}.json`),
      'utf8',
    ),
  ) as { settingsHub: Record<string, string> };

describe('settings hub', () => {
  it('has a description for every management area, in both languages', () => {
    expect(hrefs.length).toBeGreaterThan(0);
    for (const lang of ['ar', 'en']) {
      expect(Object.keys(messages(lang).settingsHub).sort()).toEqual([...hrefs].sort());
    }
  });

  it('reuses the sidebar list rather than keeping a copy', () => {
    const page = readFileSync(join(WEB, 'app', '(app)', 'settings', 'page.tsx'), 'utf8');
    expect(page).toContain("import { SETTINGS_NAV } from '@/components/app-shell';");
    expect(page).not.toContain('settings.organizationId');
  });
});
