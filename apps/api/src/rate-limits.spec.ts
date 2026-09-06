import { readFileSync } from 'node:fs';
import { join } from 'node:path';

/**
 * A named throttler must never become an app-wide ceiling.
 *
 * Every registered throttler is evaluated on every request and the strictest
 * one wins. Registering `ocr` at twenty a minute therefore did not limit OCR —
 * it limited the entire API to twenty requests a minute. Measured: the contact
 * list served 20 and then returned 429, with RATE_LIMIT_DEFAULT_PER_MINUTE set
 * to 100000 and nothing anywhere saying why.
 *
 * The fix is that `auth`, `upload` and `ocr` are registered effectively open
 * and get their real number from the `@Throttle` on the single route each is
 * for. This reads the module rather than restating it, so putting a real limit
 * back into the registration fails here instead of quietly throttling
 * everything again.
 */
const MODULE = readFileSync(join(__dirname, 'app.module.ts'), 'utf8');

/** The `{ name: 'x', ttl: …, limit: … }` entries, in order. */
function throttlers(): { name: string; limit: string }[] {
  return [...MODULE.matchAll(/\{\s*name:\s*'(\w+)',\s*ttl:\s*[\w_]+,\s*limit:\s*([^}]+?)\s*\}/g)].map(
    (match) => ({ name: match[1]!, limit: match[2]!.trim() }),
  );
}

describe('rate limit registration', () => {
  it('registers the four buckets the configuration describes', () => {
    expect(throttlers().map((t) => t.name)).toEqual(['default', 'auth', 'upload', 'ocr']);
  });

  it('lets only `default` limit every route', () => {
    const [fallback] = throttlers();
    expect(fallback!.limit).toBe('config.rateLimits.default');
  });

  it('registers every named bucket open, so none of them caps the whole API', () => {
    // Reported as pairs so a failure names the bucket that would do the capping.
    const named = throttlers().filter((bucket) => bucket.name !== 'default');
    expect(named.map((bucket) => `${bucket.name}=${bucket.limit}`)).toEqual(
      named.map((bucket) => `${bucket.name}=Number.MAX_SAFE_INTEGER`),
    );
  });
});

/**
 * …and the per-route limits must come from the environment.
 *
 * A decorator that carries a literal silently overrides the value the module
 * built from configuration, so the documented variable does nothing at all.
 * That was true of all four of them.
 */
describe('per-route rate limits', () => {
  const controllers = {
    'RATE_LIMIT_AUTH_PER_MINUTE': 'modules/auth/auth.controller.ts',
    'RATE_LIMIT_REFRESH_PER_MINUTE': 'modules/auth/auth.controller.ts',
    'RATE_LIMIT_UPLOAD_PER_MINUTE': 'modules/cheques/cheque.controller.ts',
    'RATE_LIMIT_OCR_PER_MINUTE': 'modules/cheques/cheque.controller.ts',
  };

  for (const [variable, file] of Object.entries(controllers)) {
    it(`${variable} reaches the route it documents`, () => {
      expect(readFileSync(join(__dirname, file), 'utf8')).toContain(variable);
    });
  }

  it('no @Throttle carries a bare number', () => {
    for (const file of new Set(Object.values(controllers))) {
      const source = readFileSync(join(__dirname, file), 'utf8');
      const literals = [...source.matchAll(/@Throttle\([^)]*\)/g)]
        .map(([decorator]) => decorator)
        .filter((decorator) => /limit:\s*\d/.test(decorator));
      expect(literals).toEqual([]);
    }
  });
});
