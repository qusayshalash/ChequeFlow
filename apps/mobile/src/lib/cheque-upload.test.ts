import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * A photograph must be uploaded as a file, not as a description of one.
 *
 * `{ uri, name, type }` is React Native's own FormData extension. It worked
 * while `fetch` was the XHR-backed polyfill; Expo replaces that global with a
 * WinterCG implementation that builds the multipart body in JavaScript, and
 * that converter takes a string, a Blob, or anything exposing `bytes()` — a
 * `uri` object throws "Unsupported FormDataPart implementation". Expo's own
 * source states it: "`uri` is not supported for React Native's FormData."
 *
 * The failure was silent from the server's side. The request never left the
 * phone, so nothing was logged, and the screen said "could not reach the
 * server" about a server it never contacted — while the cheque record, created
 * a moment earlier, stayed behind with no image on it.
 *
 * There is no device in this test runner, so this reads the source: the shape
 * is the whole bug, and the shape is visible.
 */
const SOURCE = readFileSync(join(__dirname, 'cheque-upload.ts'), 'utf8');

describe('captured cheque upload', () => {
  it('appends a File, which carries its own bytes', () => {
    expect(SOURCE).toMatch(/form\.append\('file',\s*new File\(image\.uri\)/);
  });

  it('imports that File from expo-file-system', () => {
    // Not the global web File: this one is backed by a path on the device.
    expect(SOURCE).toMatch(/import \{ File \} from 'expo-file-system'/);
  });

  it('never appends a uri descriptor again', () => {
    const descriptor = /append\(\s*'file'\s*,\s*\{[^}]*\buri\b/s;
    expect(descriptor.test(SOURCE), 'a { uri, name, type } part is back').toBe(false);
  });

  it('still sends the side and the capture time alongside it', () => {
    expect(SOURCE).toContain("form.append('side', image.side)");
    expect(SOURCE).toMatch(/form\.append\('capturedAt'/);
  });
});
