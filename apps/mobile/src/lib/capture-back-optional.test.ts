import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The back of a cheque is worth photographing sometimes, never always.
 *
 * It was optional in the gate — only the front was ever checked — and
 * mandatory in every other signal the screen gave. After the front, the
 * heading turned into an instruction to photograph the back, and the empty
 * slot beside it was a dashed box, which is how an interface says "unfinished".
 * People photographed the back because the screen asked them to.
 *
 * Reading the source rather than rendering it: there is no DOM in this
 * runner, and the things that made it feel required were a heading, a
 * placeholder and the absence of a sentence.
 */
const SCREEN = readFileSync(join(__dirname, '../../app/(app)/capture.tsx'), 'utf8');

describe('the capture screen', () => {
  it('lets the front alone be enough', () => {
    // The upload gate looks at the front and nothing else.
    expect(SCREEN).toMatch(/disabled=\{!shots\.FRONT\}/);
    expect(SCREEN).not.toMatch(/disabled=\{[^}]*shots\.BACK/);
  });

  it('names the back optional in the heading, rather than commanding it', () => {
    expect(SCREEN).toContain("t('capture.backOptional')");
  });

  it('says so in the empty slot too', () => {
    // The label is conditional on the side, so both halves have to be on the
    // same line — `[^}]*` would have stopped at the `}` of `style={…}`.
    const slot = SCREEN.split('\n').find((line) => line.includes("key === 'BACK'"));
    expect(slot, "no BACK-only branch in the placeholder").toBeDefined();
    expect(slot).toContain("capture.optional");
  });

  it('and tells you the front is enough, once the front is taken', () => {
    expect(SCREEN).toMatch(/shots\.FRONT && !shots\.BACK/);
    expect(SCREEN).toContain("t('capture.frontIsEnough')");
  });

  it('still uploads whichever sides were taken', () => {
    // Optional means it is sent when it exists, not that it is dropped.
    expect(SCREEN).toMatch(/Object\.entries\(shots\)/);
  });
});
