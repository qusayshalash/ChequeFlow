import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Where a person changes their password, and where an administrator resets
 * someone else's. Neither had a screen.
 */
const WEB = process.cwd();
const PAGE = readFileSync(join(WEB, 'app', '(app)', 'account', 'password', 'page.tsx'), 'utf8');
const MENU = readFileSync(join(WEB, 'components', 'top-bar.tsx'), 'utf8');
const USERS = readFileSync(join(WEB, 'app', '(app)', 'users', 'page.tsx'), 'utf8');

describe('changing your own password', () => {
  it('is open to everyone, not only to who may manage settings', () => {
    // Settings sits behind `settings.manage`; a cashier could never reach it.
    expect(PAGE).not.toContain('RequirePermission');
    expect(MENU).toContain('href="/account/password"');
  });

  it('lets a password manager fill and save it', () => {
    expect(PAGE).toContain('autoComplete="current-password"');
    expect(PAGE).toContain('autoComplete="new-password"');
  });

  it('checks the confirmation here and never sends it', () => {
    expect(PAGE).toContain("t('account.passwordsDiffer')");
    expect(PAGE).not.toMatch(/changePassword\([^)]*confirmPassword/);
  });
});

describe('resetting someone else', () => {
  it('is offered on every row but your own', () => {
    // Your own goes through the page that asks for the current password; the
    // server refuses a self-reset from here.
    expect(USERS).toMatch(/user\.id !== session\?\.id \? \(\s*<Button/);
    expect(USERS).toContain('newPassword: resetPassword');
  });
});

describe('a locked account at sign-in', () => {
  it('is told how long is left, not just "try later"', () => {
    // Without the minutes, the owner retries at once and finds it still locked.
    const login = readFileSync(join(WEB, 'app', 'login', 'page.tsx'), 'utf8');
    expect(login).toContain('signInMessageValues(caught)');
    expect(login).toContain("error.code === 'ACCOUNT_LOCKED'");
  });
});
