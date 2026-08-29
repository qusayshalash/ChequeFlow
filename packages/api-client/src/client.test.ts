import { describe, expect, it, vi } from 'vitest';

import { ApiClientError } from './errors.js';
import { ChequeFlowApiClient } from './client.js';
import { MemoryTokenStore } from './token-store.js';

function jsonResponse(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(status === 204 ? null : JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });
}

const tokens = {
  accessToken: 'access-1',
  refreshToken: 'refresh-1',
  expiresIn: 900,
  tokenType: 'Bearer' as const,
};

describe('ChequeFlowApiClient', () => {
  it('sends the bearer token on authenticated calls', async () => {
    const store = new MemoryTokenStore();
    await store.setTokens(tokens);
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ id: 'u1' }));

    const client = new ChequeFlowApiClient({
      baseUrl: 'http://api.test/api/v1',
      tokenStore: store,
      fetchImpl,
    });
    await client.me();

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer access-1');
  });

  it('does not send a token on login', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse(tokens));
    const store = new MemoryTokenStore();
    await store.setTokens(tokens);

    const client = new ChequeFlowApiClient({
      baseUrl: 'http://api.test',
      tokenStore: store,
      fetchImpl,
    });
    await client.login('a@b.com', 'secret');

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>).Authorization).toBeUndefined();
  });

  it('serializes array and scalar query parameters', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ data: [], meta: {} }));
    const client = new ChequeFlowApiClient({ baseUrl: 'http://api.test', fetchImpl });

    await client.listCheques({ status: ['IN_HAND', 'DEPOSITED'], page: 2, search: 'CHQ' });

    const [url] = fetchImpl.mock.calls[0] as [string];
    expect(url).toContain('status=IN_HAND&status=DEPOSITED');
    expect(url).toContain('page=2');
    expect(url).toContain('search=CHQ');
  });

  it('omits empty query parameters', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse([]));
    const client = new ChequeFlowApiClient({ baseUrl: 'http://api.test', fetchImpl });

    await client.listBanks(undefined);
    const [url] = fetchImpl.mock.calls[0] as [string];
    expect(url).not.toContain('country');
  });

  it('refreshes once and retries the original request on a 401', async () => {
    const store = new MemoryTokenStore();
    await store.setTokens(tokens);
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'UNAUTHENTICATED' } }, 401))
      .mockResolvedValueOnce(jsonResponse({ ...tokens, accessToken: 'access-2' }))
      .mockResolvedValueOnce(jsonResponse({ id: 'u1' }));

    const client = new ChequeFlowApiClient({
      baseUrl: 'http://api.test',
      tokenStore: store,
      fetchImpl,
    });
    await expect(client.me()).resolves.toEqual({ id: 'u1' });

    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect((await store.getTokens())?.accessToken).toBe('access-2');
  });

  it('clears the session and notifies when the refresh fails', async () => {
    const store = new MemoryTokenStore();
    await store.setTokens(tokens);
    const onSessionExpired = vi.fn();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'UNAUTHENTICATED' } }, 401))
      .mockResolvedValueOnce(jsonResponse({ error: { code: 'UNAUTHENTICATED' } }, 401));

    const client = new ChequeFlowApiClient({
      baseUrl: 'http://api.test',
      tokenStore: store,
      fetchImpl,
      onSessionExpired,
    });

    await expect(client.me()).rejects.toBeInstanceOf(ApiClientError);
    expect(onSessionExpired).toHaveBeenCalledTimes(1);
    expect(await store.getTokens()).toBeNull();
  });

  it('maps the API error envelope onto ApiClientError', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: 'DUPLICATE_CHEQUE',
            messageKey: 'errors.DUPLICATE_CHEQUE',
            message: 'A matching cheque already exists.',
            requestId: 'req-1',
            timestamp: '2026-01-01T00:00:00.000Z',
            details: { existingChequeId: 'abc' },
          },
        },
        409,
        { 'x-request-id': 'req-1' },
      ),
    );

    const client = new ChequeFlowApiClient({ baseUrl: 'http://api.test', fetchImpl });
    await expect(client.getCheque('id')).rejects.toMatchObject({
      code: 'DUPLICATE_CHEQUE',
      messageKey: 'errors.DUPLICATE_CHEQUE',
      requestId: 'req-1',
      status: 409,
    });
  });

  it('exposes field errors as a map for forms', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(
        {
          error: {
            code: 'VALIDATION_ERROR',
            messageKey: 'errors.VALIDATION_ERROR',
            message: 'invalid',
            requestId: 'r',
            timestamp: 'now',
            fieldErrors: [{ path: 'amount', message: 'validation.money.positive' }],
          },
        },
        422,
      ),
    );

    const client = new ChequeFlowApiClient({ baseUrl: 'http://api.test', fetchImpl });
    const error = (await client.getCheque('id').catch((e: unknown) => e)) as ApiClientError;
    expect(error.fieldErrorMap).toEqual({ amount: 'validation.money.positive' });
  });

  it('wraps network failures instead of leaking them', async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const client = new ChequeFlowApiClient({ baseUrl: 'http://api.test', fetchImpl });

    const error = (await client.getDashboard().catch((e: unknown) => e)) as ApiClientError;
    expect(error).toBeInstanceOf(ApiClientError);
    expect(error.messageKey).toBe('errors.network');
    expect(error.status).toBe(0);
  });

  it('does not set a JSON content type for multipart uploads', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(jsonResponse({ image: {}, duplicates: [] }));
    const client = new ChequeFlowApiClient({ baseUrl: 'http://api.test', fetchImpl });

    const form = new FormData();
    form.append('side', 'FRONT');
    await client.uploadChequeImage('cheque-1', form);

    const [, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect((init.headers as Record<string, string>)['Content-Type']).toBeUndefined();
  });

  it('clears tokens locally even when logout fails on the server', async () => {
    const store = new MemoryTokenStore();
    await store.setTokens(tokens);
    const fetchImpl = vi.fn().mockRejectedValue(new Error('offline'));

    const client = new ChequeFlowApiClient({
      baseUrl: 'http://api.test',
      tokenStore: store,
      fetchImpl,
    });
    await expect(client.logout()).rejects.toBeTruthy();
    expect(await store.getTokens()).toBeNull();
  });
});
