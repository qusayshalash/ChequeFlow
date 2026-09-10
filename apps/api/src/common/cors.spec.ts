import { isAllowedOrigin, isLocalHostname } from './cors';

/**
 * The development allowance must not become a production one.
 *
 * A dashboard opened from a phone is served from the machine's LAN address,
 * which changes whenever the router decides it should. Keeping that in
 * `CORS_ORIGINS` by hand failed the obvious way: the page loaded and every
 * screen came up empty, with the reason only in the browser console. So in
 * development any address that exists solely inside this network is accepted
 * — and in production nothing is, beyond the configured list.
 */
describe('CORS origins', () => {
  const configured = ['https://app.example.com'];

  it('accepts what is configured, in either mode', () => {
    expect(isAllowedOrigin('https://app.example.com', configured, true)).toBe(true);
    expect(isAllowedOrigin('https://app.example.com', configured, false)).toBe(true);
  });

  it('refuses everything else in production', () => {
    for (const origin of [
      'http://192.168.1.121:3000',
      'http://localhost:3000',
      'https://evil.example.com',
    ]) {
      expect(isAllowedOrigin(origin, configured, true)).toBe(false);
    }
  });

  it('accepts this machine and this network in development', () => {
    for (const origin of [
      'http://localhost:3000',
      'http://127.0.0.1:3000',
      'http://192.168.1.121:3000',
      'http://10.0.0.4:3000',
      'http://172.16.5.9:3000',
      'http://mac.local:3000',
      'http://[::1]:3000',
    ]) {
      expect(isAllowedOrigin(origin, configured, false)).toBe(true);
    }
  });

  it('refuses a public address even in development', () => {
    // Development is not an invitation for any site on the internet to read a
    // signed-in session.
    for (const origin of [
      'https://evil.example.com',
      'http://8.8.8.8',
      // Close to a private range without being in one.
      'http://172.32.0.1:3000',
      'http://11.0.0.1:3000',
      // A public host whose *name* merely ends in something familiar.
      'https://notlocalhost.example.com',
    ]) {
      expect(isAllowedOrigin(origin, configured, false)).toBe(false);
    }
  });

  it('lets through a request that carries no origin at all', () => {
    // curl, a native app, a same-origin call: there is nothing to refuse, and
    // refusing it would break every client that is not a browser.
    expect(isAllowedOrigin(undefined, configured, true)).toBe(true);
  });

  it('refuses an origin that is not a URL, or not http', () => {
    expect(isAllowedOrigin('null', configured, false)).toBe(false);
    expect(isAllowedOrigin('file://', configured, false)).toBe(false);
    expect(isAllowedOrigin('chrome-extension://abc', configured, false)).toBe(false);
  });

  it('knows a private host from a public one', () => {
    expect(isLocalHostname('192.168.0.1')).toBe(true);
    expect(isLocalHostname('172.31.255.254')).toBe(true);
    expect(isLocalHostname('172.15.0.1')).toBe(false);
    expect(isLocalHostname('example.com')).toBe(false);
  });
});
