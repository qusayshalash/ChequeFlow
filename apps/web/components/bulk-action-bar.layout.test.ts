import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The bulk action bar must stay inside the content column.
 *
 * It docked with `position: fixed`, which is positioned against the viewport —
 * and the viewport includes the sidebar. Measured at 1500px wide, the bar ran
 * from x16 to x1484 while the sidebar occupied x1228 to x1500, so the selected
 * count, the action select and half the destination select were underneath it
 * and could not be seen or clicked. `sticky` is positioned inside the content
 * column, so the bar follows it at any width and at either collapse state.
 *
 * The second half is the pill's own width. Every direct child of the wrapping
 * flex row is content-sized; a `width: 100%` child forces the row to its
 * maximum instead. Choosing "receive" added a one-line hint that way, which
 * stretched the pill from 1035px to the full 1468px and threw the buttons to
 * the opposite end of the screen from the controls they act on. Messages now
 * stack above the pill rather than inside it.
 *
 * Read out of the source because both faults are one utility class each, and
 * both are the kind of class that gets pasted back in while chasing a look.
 */

const SOURCE = readFileSync(join(__dirname, 'bulk-action-bar.tsx'), 'utf8');

/** Every `className="…"` literal in the file, in source order. */
function classLists(): string[] {
  return [...SOURCE.matchAll(/className="([^"]+)"/g)].map((match) => match[1]!);
}

describe('bulk action bar layout', () => {
  it('never positions itself against the viewport', () => {
    // `fixed` would reach under the sidebar; the docked pill and the success
    // banner are both affected, so no class list may carry it.
    for (const list of classLists()) {
      expect(list.split(/\s+/)).not.toContain('fixed');
    }
  });

  it('docks by sticking inside the content column', () => {
    expect(SOURCE).toMatch(/className="[^"]*\bsticky\b[^"]*\bbottom-5\b/);
  });

  it('has no full-width child that could stretch the pill', () => {
    // `w-full` on a flex child of the wrapping row is what stretched the bar
    // across the whole column. Messages live outside that row now, capped by
    // a `max-w-[…ch]` instead.
    for (const list of classLists()) {
      expect(list.split(/\s+/)).not.toContain('w-full');
    }
  });

  it('keeps the buttons beside the controls', () => {
    // `ms-auto` pushed them to the far end of a stretched bar — 1200px from
    // the selects they apply to.
    expect(SOURCE).not.toContain('ms-auto');
  });
});
