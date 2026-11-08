import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Metro inlines `process.env.EXPO_PUBLIC_*` only where it is spelled out.
 *
 * The config read each variable through a helper given its name, so nothing
 * was inlined and a built app saw an empty environment: the EAS preview meant
 * for the deployed server called `localhost`. Expo Go derives the address from
 * the dev server, which is why it was never noticed there.
 */
const config = readFileSync(join(__dirname, 'config.ts'), 'utf8');

describe('build-time configuration', () => {
  it.each(['EXPO_PUBLIC_API_URL', 'EXPO_PUBLIC_API_PORT', 'EXPO_PUBLIC_DEFAULT_LOCALE'])(
    'spells out process.env.%s',
    (name) => {
      expect(config).toContain(`process.env.${name}`);
    },
  );

  it('never reads process.env by a computed name', () => {
    expect(config).not.toMatch(/process\.env\s*\[|=\s*process\.env\s*;/);
  });
});
