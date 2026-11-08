import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The show-password button sits on the side the input keeps clear.
 *
 * The input is LTR and reserves its end padding on the right; the button was
 * placed at `end-3` inside an RTL wrapper, which is the left. Typed characters
 * ran under the button.
 */
describe('the login password field', () => {
  it('lays out the input and its button in the same direction', () => {
    const page = readFileSync(join(__dirname, '..', 'app', 'login', 'page.tsx'), 'utf8');
    expect(page).toMatch(/<div className="relative" dir="ltr">\s*<input\s+id="password"/);
  });
});
