import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The audit trail, reachable.
 *
 * `cheque_events` and `audit_logs` refuse UPDATE and DELETE at the database
 * level rather than by convention — the system's central promise is that the
 * record of what happened cannot be edited afterwards. The endpoint and the
 * `AUDIT_VIEW` permission had both existed since the beginning, and no client
 * could call either, so the promise was kept and shown to nobody. There was
 * even a `nav.auditLogs` label, in both languages, pointing at nothing.
 *
 * That is the fault this file pins: not that the page renders, but that it
 * stays connected. A page nothing links to is the same as no page, and it is
 * the state this feature was already in for months.
 */

const WEB = process.cwd();
const PAGE = join(WEB, 'app', '(app)', 'audit', 'page.tsx');
const SHELL = readFileSync(join(WEB, 'components', 'app-shell.tsx'), 'utf8');

describe('the audit trail is reachable', () => {
  it('has a page', () => {
    expect(existsSync(PAGE)).toBe(true);
  });

  it('is offered in the navigation, to the permission that owns it', () => {
    // The label existed for months with no destination. A page with no link
    // is the same as no page.
    expect(SHELL).toContain("href: '/audit'");
    expect(SHELL).toContain("labelKey: 'nav.auditLogs'");
    expect(SHELL).toMatch(/href: '\/audit'[\s\S]{0,200}Permission\.AUDIT_VIEW/);
  });

  it('is behind the same permission the endpoint requires', () => {
    // Showing the link and then refusing the data is worse than hiding both.
    const page = readFileSync(PAGE, 'utf8');
    expect(page).toContain('Permission.AUDIT_VIEW');
    expect(page).toContain('RequirePermission');
  });

  it('offers nothing to act on', () => {
    // Read-only by construction is the point: an append-only record with an
    // edit control on it would be a contradiction in the interface.
    const page = readFileSync(PAGE, 'utf8');
    expect(page).not.toMatch(/method: '(POST|PATCH|PUT|DELETE)'/);
    expect(page).not.toContain('useMutation');
  });

  it('resets to the first page when the filter changes', () => {
    // A filter that keeps the old page number shows an empty table, which
    // reads as "no results" rather than "page 7 of a shorter list".
    const page = readFileSync(PAGE, 'utf8');
    expect(page).toMatch(/setAction\(event\.target\.value\);[\s\S]{0,300}setPage\(1\)/);
  });
});
