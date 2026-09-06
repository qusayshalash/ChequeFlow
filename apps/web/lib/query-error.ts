import { ApiClientError } from '@cheque-flow/api-client';
import type { Translator } from '@cheque-flow/localization';

/**
 * What to put above a failed list.
 *
 * Every page used to print "could not load the data" for any failure, which is
 * true and useless: it reads as "something is broken" when the actual answer is
 * often "wait a moment" or "sign in again". A rate limit in particular looks
 * exactly like a server fault to the reader, and it was reached here by typing
 * in the filter box — five requests for a five-letter word, against a budget of
 * 120 a minute — so the next thing the page asked for came back 429 and the
 * whole list turned red.
 *
 * The server already names the reason. This prefers it, and falls back to the
 * generic line only for failures that carry no name (a dropped connection).
 */
export function loadErrorTitle(t: Translator, error: unknown): string {
  return error instanceof ApiClientError && error.messageKey
    ? t(error.messageKey)
    : t('errors.loadFailed');
}

/** The request id to print beside it, when the failure carries one. */
export function loadErrorRequestId(error: unknown): string | null {
  return error instanceof ApiClientError ? error.requestId : null;
}
