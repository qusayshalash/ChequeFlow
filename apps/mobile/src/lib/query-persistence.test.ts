import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Reading the ledger without a signal.
 *
 * Writing offline was already handled — a cheque photographed on a rooftop is
 * queued and sent when the server comes back. Reading was not: the query cache
 * lived in memory, so an app opened without a signal showed empty screens, the
 * same cheques it had displayed a minute earlier gone because the process had
 * restarted in between.
 *
 * Two things can go wrong quietly here, and both are what these tests pin. The
 * cache can be written and never restored, because a query collected out of
 * memory can no longer be rehydrated from disk — the app would look exactly as
 * it does with no cache at all. And the cache can outlive the session, which
 * would show the next person to hold the phone the last person's ledger.
 */

const SRC = join(process.cwd(), 'src');
const PERSISTENCE = readFileSync(join(SRC, 'lib', 'query-persistence.ts'), 'utf8');
const PROVIDERS = readFileSync(join(SRC, 'components', 'providers.tsx'), 'utf8');
const SETTINGS = readFileSync(join(process.cwd(), 'app', '(app)', 'more', 'settings.tsx'), 'utf8');

/** Multiplies out a duration written as `24 * 60 * 60 * 1000`. */
function milliseconds(expression: string): number {
  return expression
    .split('*')
    .map((part) => Number(part.replace(/[_\s]/g, '')))
    .reduce((product, part) => product * part, 1);
}

/** The one the persister will not read past. */
function persistedMaxAge(): number {
  const match = PERSISTENCE.match(/const MAX_AGE_MS = ([0-9_ *]+);/);
  expect(match, 'MAX_AGE_MS not found').not.toBeNull();
  return milliseconds((match as RegExpMatchArray)[1] as string);
}

/** The one the client will not keep a query past. */
function memoryLifetime(): number {
  const match = PROVIDERS.match(/gcTime:\s*([0-9_ *]+),/);
  expect(match, 'gcTime not found').not.toBeNull();
  return milliseconds((match as RegExpMatchArray)[1] as string);
}

describe('the cache survives a restart', () => {
  it('keeps queries in memory at least as long as it keeps them on disk', () => {
    // The subtle one. A query dropped from memory cannot be restored from
    // disk, so a `gcTime` shorter than `maxAge` writes a cache that can never
    // be read back — and the app looks precisely as it did with no cache.
    expect(memoryLifetime()).toBeGreaterThanOrEqual(persistedMaxAge());
  });

  it('restores through the provider rather than on a timer', () => {
    // Restoring in an effect races the first screen's own fetch.
    expect(PROVIDERS).toContain('PersistQueryClientProvider');
    expect(PROVIDERS).toContain('persistOptions={persistOptions}');
    expect(PROVIDERS).not.toContain('<QueryClientProvider');
  });

  it('stores what succeeded, and nothing else', () => {
    // A stored failure is replayed as though it had just happened, and a
    // stored mutation gives the draft queue a second owner.
    expect(PERSISTENCE).toContain("query.state.status === 'success'");
    expect(PERSISTENCE).toContain('shouldDehydrateMutation: () => false');
  });

  it('drops the cache when the build that wrote it is gone', () => {
    // A response shape that changed between versions would otherwise be
    // restored into screens that have already moved on.
    expect(PERSISTENCE).toContain('buster: APP_VERSION');
  });
});

describe('the cache does not outlive the session', () => {
  it('is wiped when a session ends, on both paths', () => {
    // Expiry and a deliberate sign-out are different code, and the cache is
    // on disk: whichever one is forgotten leaves a readable ledger behind.
    expect(PROVIDERS).toContain('forgetCachedAnswers()');
    expect(SETTINGS).toContain('forgetCachedAnswers()');
  });

  it('clears the memory cache too, not only the file', () => {
    expect(PROVIDERS).toMatch(/queryClient\.clear\(\)[\s\S]{0,200}forgetCachedAnswers\(\)/);
    expect(SETTINGS).toMatch(/queryClient\.clear\(\)[\s\S]{0,200}forgetCachedAnswers\(\)/);
  });

  it('never fails a sign-out because storage refused', () => {
    // Being unable to clear a cache is not a reason to keep someone signed in.
    expect(PERSISTENCE).toMatch(/removeClient\(\)[\s\S]{0,200}catch/);
  });
});
