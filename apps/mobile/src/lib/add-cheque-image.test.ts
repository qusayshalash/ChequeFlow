import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Adding a photograph to a recorded cheque.
 *
 * The camera was reachable only through capture, which reads the cheque, so
 * with reading turned off on the server a cheque entered by hand could never
 * get its picture. These pin the way back in.
 */
const read = (...path: string[]) => readFileSync(join(process.cwd(), ...path), 'utf8');
const screen = read('app', '(app)', 'cheques', '[id]', 'index.tsx');
const component = read('src', 'components', 'add-cheque-image.tsx');

describe('adding a photo to a cheque', () => {
  it('is on the cheque screen whether reading is on or off', () => {
    expect(screen).toContain('<AddChequeImage chequeId={chequeId} />');
    // Not tied to reading: the one thing that hid the camera before.
    expect(screen).not.toMatch(/ocrOff[^\n]*AddChequeImage/);
    expect(component).not.toMatch(/processOcr|ocrEnabled/);
  });

  it('is offered only to someone who may record cheques, as the server requires', () => {
    expect(screen).toContain('Permission.CHEQUE_CREATE');
    expect(screen).toMatch(/canAdd \? <AddChequeImage/);
  });

  it('takes a photo or a gallery image, filed under the side chosen', () => {
    expect(component).toContain('ImagePicker.launchCameraAsync');
    expect(component).toContain('ImagePicker.launchImageLibraryAsync');
    expect(component).toContain("form.append('side', side)");
  });

  it("sends a real file, the shape Expo's fetch accepts", () => {
    expect(component).toContain('new File(uri) as unknown as Blob');
    // The `{ uri, name, type }` object Expo's fetch rejects, as code (the
    // comment above the line names it, to say why it is not used).
    expect(component).not.toMatch(/append\('file', \{/);
  });

  it('asks before attaching a photo that is already on another cheque', () => {
    expect(component).toContain("error.code === 'DUPLICATE_CHEQUE'");
    expect(component).toContain('allowDuplicate: true');
  });

  it('declares why it wants the camera and the gallery', () => {
    const config = JSON.parse(read('app.json')) as { expo: { plugins: unknown[] } };
    const picker = config.expo.plugins.find(
      (entry) => Array.isArray(entry) && entry[0] === 'expo-image-picker',
    ) as [string, { photosPermission?: string; cameraPermission?: string }] | undefined;
    expect(picker?.[1].photosPermission).toBeTruthy();
    expect(picker?.[1].cameraPermission).toBeTruthy();
  });
});
