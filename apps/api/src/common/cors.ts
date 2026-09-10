/**
 * Which origins may call the API from a browser.
 *
 * In production this is exactly `CORS_ORIGINS` and nothing else.
 *
 * In development it also accepts any origin on the machine or the local
 * network, because that list cannot be kept correct by hand. The dashboard is
 * opened from this machine as `localhost:3000` and from a phone as
 * `192.168.1.x:3000`, and the router hands out a different address whenever it
 * feels like it — so an unlisted address meant a page that loaded and then
 * showed nothing, with the reason visible only in the browser console.
 *
 * The addresses allowed are the ones that cannot be reached from outside the
 * network: loopback, the three private IPv4 ranges, IPv6 link-local and
 * unique-local, and mDNS `.local` names. A development API is already
 * listening on that network; what this decides is whether a page served from
 * the same network may read it.
 */
const PRIVATE_IPV4 =
  /^(10\.|127\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;

/** True for a host that only exists inside this machine or this network. */
export function isLocalHostname(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true;
  // fe80::/10 link-local, fc00::/7 unique-local.
  if (/^fe[89ab][0-9a-f]:/.test(host) || /^f[cd][0-9a-f]{2}:/.test(host)) return true;
  if (host.endsWith('.local')) return true;
  return PRIVATE_IPV4.test(host);
}

/**
 * The CORS `origin` decision for one request.
 *
 * `undefined` is what a same-origin request, a curl call or a native app sends
 * — there is no origin to refuse, and refusing it would break every client
 * that is not a browser.
 */
export function isAllowedOrigin(
  origin: string | undefined,
  configured: readonly string[],
  isProduction: boolean,
): boolean {
  if (!origin) return true;
  if (configured.includes(origin)) return true;
  if (isProduction) return false;

  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return false;
  return isLocalHostname(url.hostname);
}
