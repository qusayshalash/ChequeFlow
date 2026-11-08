import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Typing in a panel keeps the cursor where it is.
 *
 * The drawer's open effect listed `onClose` as a dependency, and every caller
 * passes a new arrow on each render, so each keystroke re-ran the effect and
 * moved focus to the close button. Adding a user meant clicking back into the
 * field before every letter.
 */
const drawer = readFileSync(join(__dirname, '..', 'components', 'drawer.tsx'), 'utf8');

describe('the drawer', () => {
  it('runs its focus effect on open and close only', () => {
    expect(drawer).toMatch(/\}, \[open\]\);/);
    expect(drawer).not.toMatch(/\[open, onClose\]/);
  });

  it('still closes on Escape, through the latest handler', () => {
    expect(drawer).toMatch(/closeRef\.current = onClose;/);
    expect(drawer).toMatch(/event\.key === 'Escape'[\s\S]*?closeRef\.current\(\);/);
  });
});

/**
 * The image viewer had the same dependency, and its effect calls `reset()`:
 * any re-render of the cheque page while an image was open threw away the
 * reader's zoom and pan.
 */
describe('the image viewer', () => {
  const viewer = readFileSync(join(__dirname, '..', 'components', 'image-lightbox.tsx'), 'utf8');

  it('resets the zoom only when the image changes', () => {
    expect(viewer).toMatch(/\}, \[url, reset\]\);/);
    expect(viewer).not.toMatch(/\[url, onClose, reset\]/);
  });

  it('still closes on Escape, through the latest handler', () => {
    expect(viewer).toMatch(/event\.key === 'Escape'\) closeHandler\.current\(\);/);
  });
});
