import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Looking at a cheque on the dashboard.
 *
 * The photographs are around six megapixels and the record showed them scaled
 * into whatever was left of a side column, which is not enough to read a
 * handwritten amount — the one thing the photograph is kept for.
 *
 * The rules below are the ones that make a full-window overlay usable rather
 * than merely large: it has to be leavable without a mouse, it must not let
 * the page behind it scroll away underneath, and the control that magnifies
 * has to say what it will do.
 */

const WEB = process.cwd();
const LIGHTBOX = readFileSync(join(WEB, 'components', 'image-lightbox.tsx'), 'utf8');
const PANEL = readFileSync(join(WEB, 'components', 'cheque-images.tsx'), 'utf8');

describe('the cheque image opens properly', () => {
  it('replaces the inline preview', () => {
    expect(PANEL).toContain('<ImageLightbox');
    // The old answer scaled the image into the panel it was already in.
    expect(PANEL).not.toMatch(/<img[\s\S]{0,120}className="w-full rounded-xl/);
  });

  it('can be left without a mouse', () => {
    // A full-window overlay with no Escape is a trap for anyone on a keyboard.
    expect(LIGHTBOX).toContain("event.key === 'Escape'");
    expect(LIGHTBOX).toContain('closeRef.current?.focus()');
    expect(LIGHTBOX).toContain('aria-modal="true"');
  });

  it('stops the page behind it from scrolling, and puts it back', () => {
    // Left set, the dashboard underneath is frozen for the rest of the visit.
    expect(LIGHTBOX).toContain("document.body.style.overflow = 'hidden'");
    expect(LIGHTBOX).toContain('document.body.style.overflow = previous');
  });

  it('says what the magnify control will do', () => {
    // A button that only says "zoom" leaves you guessing where you are.
    expect(LIGHTBOX).toContain('{scale}\u00d7');
    expect(LIGHTBOX).toContain('STEPS');
  });
});
