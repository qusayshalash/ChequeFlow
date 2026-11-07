import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Photographing creates a placeholder record and then runs the reader.
 *
 * On a server with reading off the second step is refused, so each attempt
 * would leave a TMP-numbered draft behind. Both ways into the camera go.
 */
const screen = (name: string) =>
  readFileSync(join(__dirname, '..', '..', 'app', '(app)', name), 'utf8');

describe('the camera with reading turned off', () => {
  it.each(['add.tsx', 'index.tsx'])('is not offered on %s', (name) => {
    expect(screen(name)).toMatch(
      /ocrOff \? null : \(\s+<(?:Choice|QuickAction)[\s\S]*?\/\(app\)\/capture/,
    );
  });
});
