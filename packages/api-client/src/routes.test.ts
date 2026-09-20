import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Every path the client calls must be a route the API actually serves.
 *
 * Nothing checks this at compile time: a path is a string, so a client method
 * pointing at a route that does not exist type-checks, builds, ships, and then
 * returns 404 the first time somebody opens the screen that uses it. That is
 * exactly what happened when the audit trail was wired up — the endpoint lives
 * at `/audit-logs` and the method was written against `/reports/audit-logs`,
 * which looked right because the handler sits in the reports controller.
 *
 * So this walks the API's controllers, builds the set of paths Nest will map,
 * and holds every `this.request(...)` in the client against it.
 */

// `process.cwd()` is the package directory under vitest; the repo root is two
// levels up. Matches how the localization suite reaches the apps.
const ROOT = path.resolve(process.cwd(), '../..');
const API = path.join(ROOT, 'apps/api/src');

function controllers(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return controllers(full);
    return entry.endsWith('.controller.ts') ? [full] : [];
  });
}

/** Turns `:id` and `${…}` into one wildcard, so a parameter matches a value. */
function shape(route: string): string {
  return `/${route}`
    .replace(/\$\{[^}]*\}/g, ':p')
    .replace(/:[A-Za-z0-9_]+/g, ':p')
    .replace(/\/+/g, '/')
    .replace(/\/$/, '');
}

/** Every path Nest maps, from the decorators the controllers carry. */
function servedPaths(): Set<string> {
  const served = new Set<string>();

  for (const file of controllers(API)) {
    const text = readFileSync(file, 'utf8');
    const base = text.match(/@Controller\(\s*'([^']*)'\s*\)/)?.[1] ?? '';

    for (const match of text.matchAll(/@(?:Get|Post|Put|Patch|Delete)\(\s*(?:'([^']*)')?\s*\)/g)) {
      served.add(shape(`${base}/${match[1] ?? ''}`));
    }
  }

  return served;
}

/** Every path the client asks for, from its own `request` calls. */
function requestedPaths(): string[] {
  const client = readFileSync(path.join(process.cwd(), 'src', 'client.ts'), 'utf8');
  const found = new Set<string>();

  // The type argument is skipped with `[^(]*` rather than `[^>]*`: a nested
  // generic such as `Paginated<AuditLogRow>>` closes the first pattern early,
  // and the call is then never seen at all — which is how this test passed
  // over the very bug it was written for, until it was checked by breaking it.
  for (const match of client.matchAll(/this\.request(?:<[^(]*>)?\(\s*[`']([^`']+)[`']/g)) {
    found.add(shape(match[1] as string));
  }

  return [...found].sort();
}

/**
 * Whether a requested path is one of the served ones.
 *
 * Segment by segment, with a parameter on either side matching anything. One
 * client call builds its last segment from a variable — the cheque actions all
 * go through the same method — so a plain string comparison would report it
 * missing forever. A literal segment still has to match a literal one, which
 * is what keeps `/reports/audit-logs` from passing as `/audit-logs`.
 */
function isServed(requested: string, served: ReadonlySet<string>): boolean {
  const wanted = requested.split('/');

  return [...served].some((candidate) => {
    const parts = candidate.split('/');
    if (parts.length !== wanted.length) return false;
    return parts.every((part, at) => part === wanted[at] || part === ':p' || wanted[at] === ':p');
  });
}

describe('the client and the API agree on where things are', () => {
  const served = servedPaths();

  it('finds both sides', () => {
    // A parser that silently matched nothing would make every assertion below
    // pass for the wrong reason.
    expect(served.size).toBeGreaterThan(30);
    expect(requestedPaths().length).toBeGreaterThan(30);
  });

  it('calls no path the API does not serve', () => {
    const missing = requestedPaths().filter((requested) => !isServed(requested, served));
    expect(missing).toEqual([]);
  });
});
