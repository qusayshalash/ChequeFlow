import { ApiErrorCode } from '@cheque-flow/shared-types';

import { AppError } from '../../common/errors/app-error';

/**
 * A refused provider is not our internal error.
 *
 * The first real Google Vision run came back `PERMISSION_DENIED: this API
 * method requires billing to be enabled` — a five-minute fix in a console. The
 * service reported it as INTERNAL_ERROR, so the screen said "an unexpected
 * error occurred" and nothing anywhere pointed at billing.
 *
 * 503 says what happened: the request left the building and something outside
 * it refused. The provider's own words stay in the log, because they carry a
 * project number and request details a signed-in user has no reason to get.
 */
describe('an OCR provider failure', () => {
  const failure = new AppError(ApiErrorCode.SERVICE_UNAVAILABLE, 'OCR provider failed', {
    cause: new Error('7 PERMISSION_DENIED: This API method requires billing to be enabled on project #178524901458'),
  });

  it('answers 503, not 500', () => {
    expect(failure.status).toBe(503);
  });

  it('carries a key the client can translate', () => {
    expect(failure.messageKey).toBe('errors.SERVICE_UNAVAILABLE');
  });

  it('keeps the provider text out of everything the client receives', () => {
    const sent = JSON.stringify({
      code: failure.code,
      messageKey: failure.messageKey,
      details: failure.details,
      fieldErrors: failure.fieldErrors,
    });
    expect(sent).not.toContain('178524901458');
    expect(sent).not.toContain('PERMISSION_DENIED');
  });

  it('still has the cause for the log', () => {
    expect(String((failure as { cause?: unknown }).cause)).toContain('PERMISSION_DENIED');
  });
});
