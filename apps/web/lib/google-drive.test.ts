import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  DRIVE_SCOPE,
  DriveError,
  backupFileName,
  buildMultipartUpload,
  driveClientId,
  randomBoundary,
  uploadToDrive,
} from './google-drive';

/**
 * Sending the archive to the owner's Drive.
 *
 * The upload is assembled by hand because Drive's multipart format is picky:
 * the metadata and the file are two parts of one request, separated by a
 * boundary that must not occur in either. A malformed body is accepted with a
 * 200 and stores an empty file, so the shape is pinned here rather than
 * discovered on the day someone needs the backup.
 */
describe('Drive upload', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
  });

  it('asks for the narrowest scope Drive offers', () => {
    // `drive.file` reaches only files this app created. Anything wider would
    // make a backup button a way to read someone's whole Drive.
    expect(DRIVE_SCOPE).toBe('https://www.googleapis.com/auth/drive.file');
  });

  it('names the file exactly as the local download does', () => {
    expect(backupFileName(new Date('2026-09-10T22:31:00Z'))).toBe(
      'chequeflow-backup-2026-09-10.json',
    );
  });

  it('puts the metadata and the archive in one multipart body', () => {
    const body = buildMultipartUpload('{"format":1}', 'backup.json', 'BOUND').body;

    expect(body).toBe(
      '--BOUND\r\n' +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        '{"name":"backup.json","mimeType":"application/json"}\r\n' +
        '--BOUND\r\n' +
        'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
        '{"format":1}\r\n' +
        '--BOUND--',
    );
  });

  it('declares the boundary it actually used', () => {
    const { contentType } = buildMultipartUpload('{}', 'b.json', 'XYZ');
    expect(contentType).toBe('multipart/related; boundary=XYZ');
  });

  it('does not reuse a boundary', () => {
    // A boundary that appeared twice in one session would still be fine, but a
    // constant one is a boundary that can collide with archive content.
    expect(randomBoundary()).not.toBe(randomBoundary());
  });

  it('offers nothing when no OAuth client is configured', () => {
    vi.stubEnv('NEXT_PUBLIC_GOOGLE_CLIENT_ID', '   ');
    expect(driveClientId()).toBeNull();
  });

  it('sends the token and the body to Drive, and returns the file', async () => {
    const calls: Array<{ url: string; init: RequestInit }> = [];
    vi.stubGlobal('fetch', (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ id: 'file-1', name: 'backup.json' }),
      } as Response);
    });

    const file = await uploadToDrive('token-123', '{"format":1}', 'backup.json');

    expect(file).toEqual({ id: 'file-1', name: 'backup.json' });
    expect(calls[0]?.url).toContain('uploadType=multipart');
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers.Authorization).toBe('Bearer token-123');
    expect(headers['Content-Type']).toMatch(/^multipart\/related; boundary=/);
    expect(calls[0]?.init.body as string).toContain('{"format":1}');
  });

  it('separates a refusal from a failure, because they read differently', async () => {
    vi.stubGlobal('fetch', () =>
      Promise.resolve({ ok: false, status: 403, json: () => Promise.resolve({}) } as Response),
    );
    await expect(uploadToDrive('t', '{}', 'b.json')).rejects.toMatchObject({ reason: 'denied' });

    vi.stubGlobal('fetch', () =>
      Promise.resolve({ ok: false, status: 500, json: () => Promise.resolve({}) } as Response),
    );
    await expect(uploadToDrive('t', '{}', 'b.json')).rejects.toBeInstanceOf(DriveError);
  });

  it('treats a 200 without a file id as a failure', async () => {
    // Drive answers 200 to a body it could not parse; without an id nothing
    // was stored, and reporting success would be the worst kind of lie here.
    vi.stubGlobal('fetch', () =>
      Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve({}) } as Response),
    );
    await expect(uploadToDrive('t', '{}', 'b.json')).rejects.toMatchObject({ reason: 'failed' });
  });
});
