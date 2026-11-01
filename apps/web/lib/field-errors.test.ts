import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The web reads a server field error from where the client puts it.
 *
 * Most web forms used `error.fieldErrorMap`, which is right. The users page
 * read `error.details.fieldErrors`, which the client never fills — so a
 * rejected field there showed only a generic banner. The phone had the same
 * fault on every form; see its own test.
 */
describe('server field errors on the web', () => {
  it('are never read from the details', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) return walk(full);
        return entry.endsWith('.tsx') ? [full] : [];
      });

    const web = process.cwd();
    const wrong = [...walk(join(web, 'app')), ...walk(join(web, 'components'))].filter((file) =>
      /details\??\.fieldErrors/.test(readFileSync(file, 'utf8')),
    );
    expect(wrong.map((file) => file.replace(web, ''))).toEqual([]);
  });
});
