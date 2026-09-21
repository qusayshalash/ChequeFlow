import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * A cheque photograph, from the shutter to the eye.
 *
 * Both halves of this were wrong in the same way: the app paid for a six
 * megapixel image and then used almost none of it. The full frame — around
 * 2178×3024, one to two megabytes a side — was uploaded untouched from a phone
 * usually on mobile data, and the record screen then showed it at 320×200,
 * where a handwritten amount is a smudge.
 *
 * `expo-image-manipulator` had been in the dependencies the whole time,
 * imported by nothing, which is the same shape of fault as the notifications
 * package before it.
 */

const SRC = join(process.cwd(), 'src');
const SHRINK = readFileSync(join(SRC, 'lib', 'shrink-image.ts'), 'utf8');
const VIEWER = readFileSync(join(SRC, 'components', 'image-viewer.tsx'), 'utf8');
const CAPTURE = readFileSync(join(process.cwd(), 'app', '(app)', 'capture.tsx'), 'utf8');
const RECORD = readFileSync(
  join(process.cwd(), 'app', '(app)', 'cheques', '[id]', 'index.tsx'),
  'utf8',
);

describe('what gets uploaded', () => {
  it('shrinks the photograph before it leaves the phone', () => {
    expect(CAPTURE).toContain('shrinkForUpload(');
    expect(SHRINK).toContain('MAX_EDGE = 1600');
  });

  it('measures the photograph before shrinking it, not after', () => {
    // The quality check reads the frame's real dimensions to decide whether
    // the shot is sharp and large enough to keep. Shrinking first would have
    // it judge this function's output instead of the photograph.
    const checked = CAPTURE.indexOf('checkCaptureQuality(');
    const shrunk = CAPTURE.indexOf('shrinkForUpload(');
    expect(checked).toBeGreaterThan(-1);
    expect(shrunk).toBeGreaterThan(checked);
  });

  it('leaves an already-small image alone', () => {
    // Re-encoding a small image makes it bigger, not smaller. Measured on the
    // stored photographs: two that were already under the limit grew from
    // 66 KB to 80 KB when put through the same resize.
    expect(SHRINK).toMatch(/longest <= MAX_EDGE\) return shot;/);
  });

  it('never fails a capture to save bandwidth', () => {
    // A phone that cannot re-encode must still be able to record the cheque.
    expect(SHRINK).toMatch(/catch \{[\s\S]{0,200}return shot;/);
  });

  it('shrinks once, where the draft queue will see it', () => {
    // Shrinking at upload instead would leave a capture taken with no signal
    // sitting on the phone at full size until it could be sent.
    expect(CAPTURE).toMatch(/shrinkForUpload\(\{[\s\S]{0,200}setShots/);
  });
});

describe('what can be looked at', () => {
  it('opens the photograph on its own screen', () => {
    expect(RECORD).toContain('<ImageViewer');
    // The old answer was a thumbnail that grew to 320×200 — still unreadable.
    expect(RECORD).not.toContain('imageLarge');
  });

  it('can be magnified, by pinch and by tap', () => {
    // Pinch is free on iOS through the scroll view and absent on Android, so
    // the double tap is wired on both.
    expect(VIEWER).toContain('maximumZoomScale');
    expect(VIEWER).toContain('CLOSE_SCALE');
    expect(VIEWER).toContain('DOUBLE_TAP_MS');
  });

  it('can be left', () => {
    // A full-screen overlay with no way out is a trap, and the hardware back
    // button has to reach it too.
    expect(VIEWER).toContain('onRequestClose');
    expect(VIEWER).toContain("accessibilityLabel={t('common.close')}");
  });
});
