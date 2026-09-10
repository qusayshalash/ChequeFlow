/**
 * Sending a backup to the owner's Google Drive, from the browser.
 *
 * The upload happens in the page with the signed-in person's own Google
 * account: they click, Google asks them once, and the file goes straight from
 * the browser to Drive. The server never sees a Google token, and there is no
 * long-lived credential anywhere for someone to steal — which is the whole
 * reason this is not done server-side.
 *
 * The scope is `drive.file`: the narrowest one Drive offers. It grants access
 * to files this app itself created and to nothing else in the account, so a
 * backup button cannot become a way to read someone's Drive.
 *
 * Configuration is one public value, `NEXT_PUBLIC_GOOGLE_CLIENT_ID`. Without
 * it the feature is not offered at all rather than shown and broken.
 */

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';

const GIS_SRC = 'https://accounts.google.com/gsi/client';
const UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart';

/** The OAuth client, or `null` when this deployment has not configured one. */
export function driveClientId(): string | null {
  const id = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID?.trim();
  return id ? id : null;
}

/** `chequeflow-backup-2026-09-10.json` — the same name the local download uses. */
export function backupFileName(now: Date = new Date()): string {
  return `chequeflow-backup-${now.toISOString().slice(0, 10)}.json`;
}

export interface MultipartBody {
  contentType: string;
  body: string;
}

/**
 * The metadata and the file in one request, as Drive's multipart upload wants.
 *
 * The boundary is passed in rather than generated here so a test can pin the
 * exact bytes; callers use `randomBoundary`.
 */
export function buildMultipartUpload(json: string, name: string, boundary: string): MultipartBody {
  const metadata = JSON.stringify({ name, mimeType: 'application/json' });
  const body =
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${metadata}\r\n` +
    `--${boundary}\r\n` +
    'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
    `${json}\r\n` +
    `--${boundary}--`;

  return { contentType: `multipart/related; boundary=${boundary}`, body };
}

export function randomBoundary(): string {
  return `chequeflow-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
}

/** Why an upload did not happen, in terms the panel can translate. */
export type DriveFailure = 'cancelled' | 'denied' | 'failed';

export class DriveError extends Error {
  constructor(readonly reason: DriveFailure) {
    super(reason);
    this.name = 'DriveError';
  }
}

interface TokenClient {
  requestAccessToken: () => void;
}

interface GoogleIdentity {
  accounts: {
    oauth2: {
      initTokenClient: (config: {
        client_id: string;
        scope: string;
        callback: (response: { access_token?: string; error?: string }) => void;
        error_callback?: (error: { type?: string }) => void;
      }) => TokenClient;
    };
  };
}

declare global {
  interface Window {
    google?: GoogleIdentity;
  }
}

/**
 * Loads Google's script, once, and only when someone actually asks for Drive.
 *
 * Not in the page head: a third-party script on every settings visit is a
 * request nobody asked for, on a page that usually has nothing to do with
 * Google.
 */
function loadIdentityServices(): Promise<GoogleIdentity> {
  if (window.google?.accounts?.oauth2) return Promise.resolve(window.google);

  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
    const script = existing ?? document.createElement('script');

    const settle = (): void => {
      if (window.google?.accounts?.oauth2) resolve(window.google);
      else reject(new DriveError('failed'));
    };

    script.addEventListener('load', settle, { once: true });
    script.addEventListener('error', () => reject(new DriveError('failed')), { once: true });

    if (!existing) {
      script.src = GIS_SRC;
      script.async = true;
      document.head.append(script);
    }
  });
}

/**
 * Asks Google for an access token for this one upload.
 *
 * Rejects with `cancelled` when the person closes the consent window — that is
 * an answer, not a failure, and the panel says nothing about it.
 */
export async function requestDriveToken(clientId: string): Promise<string> {
  const google = await loadIdentityServices();

  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: clientId,
      scope: DRIVE_SCOPE,
      callback: (response) => {
        if (response.access_token) resolve(response.access_token);
        else reject(new DriveError(response.error === 'access_denied' ? 'denied' : 'failed'));
      },
      error_callback: (error) => {
        reject(new DriveError(error.type === 'popup_closed' ? 'cancelled' : 'failed'));
      },
    });

    client.requestAccessToken();
  });
}

/** Uploads the archive and resolves with the file Drive created. */
export async function uploadToDrive(
  token: string,
  json: string,
  name: string,
): Promise<{ id: string; name: string }> {
  const { contentType, body } = buildMultipartUpload(json, name, randomBoundary());

  const response = await fetch(UPLOAD_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': contentType },
    body,
  });

  if (!response.ok) throw new DriveError(response.status === 403 ? 'denied' : 'failed');

  const file = (await response.json()) as { id?: string; name?: string };
  if (!file.id) throw new DriveError('failed');
  return { id: file.id, name: file.name ?? name };
}
