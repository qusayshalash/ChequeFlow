import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import { ApiClientError } from '@cheque-flow/api-client';

import { fieldErrorsFrom } from './form';

/**
 * A server rejection has to land on the field it is about.
 *
 * Every phone form passed `error.details` to `fieldErrorsFrom`, and the client
 * keeps field errors in `error.fieldErrors` — beside the details, not inside
 * them. So the helper returned nothing for every server rejection the app had
 * ever received, and each one fell through to a generic "invalid data" banner
 * with no field marked. Nothing failed, which is why nobody noticed: the forms
 * simply never said which field was wrong.
 *
 * It surfaced building the password change, where "the current password is
 * incorrect" has to appear under the current-password field or it is useless.
 */

/** The body the API sends for a 422, exactly as the exception filter writes it. */
const SERVER_BODY = {
  error: {
    code: 'VALIDATION_ERROR',
    messageKey: 'errors.VALIDATION_ERROR',
    message: 'Current password is incorrect',
    requestId: 'request-1',
    timestamp: '2026-11-01T12:00:00.000Z',
    fieldErrors: [{ path: 'currentPassword', message: 'validation.password.currentIncorrect' }],
  },
};

describe('a field error from the server', () => {
  const error = ApiClientError.fromResponse(422, SERVER_BODY, null);

  it('reaches the form when the error itself is handed over', () => {
    expect(fieldErrorsFrom(error)).toEqual({
      currentPassword: 'validation.password.currentIncorrect',
    });
  });

  it('is not inside the details, which is where every form used to look', () => {
    expect(fieldErrorsFrom(error.details)).toEqual({});
  });

  it('is read from the error on every screen', () => {
    const walk = (dir: string): string[] =>
      readdirSync(dir).flatMap((entry) => {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) return walk(full);
        return entry.endsWith('.tsx') ? [full] : [];
      });

    const wrong = walk(join(process.cwd(), 'app')).filter((file) =>
      /fieldErrorsFrom\(\w+\.details\)/.test(readFileSync(file, 'utf8')),
    );
    expect(wrong.map((file) => file.replace(process.cwd(), ''))).toEqual([]);
  });
});

describe('a locked account at sign-in', () => {
  it('is told how long is left, not just "try later"', () => {
    const login = readFileSync(join(process.cwd(), 'app', 'login.tsx'), 'utf8');
    expect(login).toContain('signInMessageValues(caught)');
    expect(login).toContain("error.code === 'ACCOUNT_LOCKED'");
  });
});
