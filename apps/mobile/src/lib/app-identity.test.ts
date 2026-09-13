import { existsSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The app has a face of its own.
 *
 * `assets/` was empty and `app.json` named no icon, so the app carried Expo's
 * default mark: the first thing anyone sees said someone else's name. Both
 * stores refuse an upload in that state, and a reviewer who gets that far has
 * already formed a view.
 *
 * The PNGs are generated art, not placeholders, so these tests check the
 * things that silently go wrong — a missing file, a non-square icon, a
 * flattened Android foreground — rather than how it looks.
 */

const ROOT = process.cwd();
const config = JSON.parse(readFileSync(join(ROOT, 'app.json'), 'utf8')).expo as {
  icon?: string;
  ios?: { buildNumber?: string };
  android?: { versionCode?: number; adaptiveIcon?: { foregroundImage?: string } };
  plugins?: Array<string | [string, Record<string, unknown>]>;
};

/** PNG header: width, height, and whether an alpha channel survived. */
function png(relative: string) {
  const bytes = readFileSync(join(ROOT, relative));
  expect(bytes.subarray(1, 4).toString(), `${relative} is not a PNG`).toBe('PNG');
  return {
    width: bytes.readUInt32BE(16),
    height: bytes.readUInt32BE(20),
    hasAlpha: bytes[25] === 4 || bytes[25] === 6,
    bytes: bytes.length,
  };
}

describe('app identity', () => {
  it('names an icon, and ships it', () => {
    expect(config.icon).toBeDefined();
    expect(existsSync(join(ROOT, config.icon!))).toBe(true);
  });

  it('gives the stores the square they require', () => {
    const icon = png(config.icon!);
    // 1024×1024 is what App Store Connect and Play both take; anything else is
    // rejected at upload, not at review.
    expect([icon.width, icon.height]).toEqual([1024, 1024]);
  });

  it('keeps the Android foreground transparent', () => {
    const foreground = config.android?.adaptiveIcon?.foregroundImage;
    expect(foreground).toBeDefined();
    // The launcher composites this over the background colour and masks it to
    // whatever shape the phone uses. Flattened, it becomes a white square with
    // the mark stranded in the middle of it.
    expect(png(foreground!).hasAlpha).toBe(true);
  });

  it('shows its own splash while the fonts load', () => {
    const splash = config.plugins?.find(
      (plugin): plugin is [string, Record<string, unknown>] =>
        Array.isArray(plugin) && plugin[0] === 'expo-splash-screen',
    );
    expect(splash, 'no splash configured').toBeDefined();
    const image = splash![1].image as string;
    expect(existsSync(join(ROOT, image))).toBe(true);
    expect(png(image).hasAlpha).toBe(true);
  });

  it('carries a build number on both stores', () => {
    // Neither store accepts a second upload without one that has gone up.
    expect(config.ios?.buildNumber).toBeDefined();
    expect(config.android?.versionCode).toBeGreaterThanOrEqual(1);
  });

  it('keeps the icons small enough to ship', () => {
    for (const asset of ['assets/icon.png', 'assets/adaptive-icon.png', 'assets/splash-icon.png']) {
      expect(statSync(join(ROOT, asset)).size).toBeLessThan(1_000_000);
    }
  });
});
