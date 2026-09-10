import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The filter panel is a row of equal boxes.
 *
 * Adding the sort control made the panel ragged: five controls in two shapes,
 * aligned along their bottoms. The amount was two stacked fields — a label
 * above a box — while status, bank and the date range were single boxes with
 * the label inside. Measured at 1440px, "amount — from" finished the first row
 * and "amount — to" was pushed alone onto a second, with the pair of bounds
 * split across lines and a gap beside them.
 *
 * Two rules keep it even, and both are one utility class each — the kind that
 * gets pasted back while chasing a look:
 *
 *  - every control is `h-11`, and the row centres them rather than aligning
 *    bottoms of differing heights;
 *  - the two amount bounds live in one box, because they are one control.
 *
 * Measured after the change at 1440px: one row, every child 44px tall, panel
 * 70px rather than 126px. At 375px each control takes its own full-width row,
 * and the page does not scroll sideways at any width tested.
 */

const SOURCE = readFileSync(join(__dirname, '..', 'app', '(app)', 'cheques', 'page.tsx'), 'utf8');

/** The opening tag of the element holding the filter controls. */
function panelTag(): string {
  const match = SOURCE.match(/<div className="mt-3 flex flex-wrap[^"]*"/);
  expect(match).not.toBeNull();
  return match![0];
}

describe('cheque filter panel layout', () => {
  it('centres the controls instead of aligning their bottoms', () => {
    expect(panelTag()).toContain('items-center');
    expect(panelTag()).not.toContain('items-end');
  });

  it('keeps the two amount bounds in one control', () => {
    // The stacked shape is what split them. Neither bound may carry a label
    // above it again.
    expect(SOURCE).not.toContain('flex min-w-44 flex-col');
    const amountBox = SOURCE.slice(SOURCE.indexOf("aria-label={`${t('common.amount')}"));
    // Both inputs inside the same box: the second bound appears before any
    // further element of the panel is opened.
    expect(amountBox.slice(0, amountBox.indexOf('</div>'))).toContain('amountMax');
  });

  it('gives every control the same height', () => {
    // A shorter or taller box is what makes a wrapped row look broken.
    const controls = [...SOURCE.matchAll(/className="inline-flex h-(\d+)/g)].map((m) => m[1]);
    expect(controls.length).toBeGreaterThanOrEqual(4);
    expect(new Set(controls)).toEqual(new Set(['11']));
  });
});
