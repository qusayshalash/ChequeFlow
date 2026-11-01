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
  android?: {
    versionCode?: number;
    permissions?: string[];
    blockedPermissions?: string[];
    adaptiveIcon?: { foregroundImage?: string };
  };
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

/**
 * What the app asks the phone for.
 *
 * `eas init` rewrote this list from the camera plugin's defaults and added the
 * microphone with it. A cheque app that asks to record audio is a question
 * nobody can answer, and a flag on an app review — and it arrived without
 * anybody choosing it, which is exactly the kind of change a test should be
 * the one to notice.
 */
describe('permissions', () => {
  const requested = config.android?.permissions ?? [];
  const blocked = config.android?.blockedPermissions ?? [];

  /**
   * What the app must never request, whichever library would like to.
   *
   * Listing permissions in `app.json` is not what ships: plugins add their own
   * after it. The camera plugin added the microphone, and the file-system
   * plugin adds broad storage access unconditionally — for an app that only
   * ever writes to its own cache. The generated manifest asked for all three
   * while `app.json` listed none of them, and the previous version of this
   * test, which read `app.json`, passed.
   *
   * `blockedPermissions` strips them from the final manifest no matter who
   * added them, which is why it is checked here rather than a plugin option.
   */
  const NEVER = [
    'android.permission.RECORD_AUDIO',
    'android.permission.READ_EXTERNAL_STORAGE',
    'android.permission.WRITE_EXTERNAL_STORAGE',
  ];

  it('blocks what no library may add to the manifest', () => {
    for (const permission of NEVER) {
      expect(blocked, `${permission} is not blocked`).toContain(permission);
    }
  });

  it('tells the camera plugin not to ask for the microphone, by the name it reads', () => {
    // The option was written as `recordAudioAndroidPermission`, which the
    // plugin never reads; the microphone stayed in every Android build. So
    // the name is taken from the installed plugin, not from memory.
    const plugin = readFileSync(
      join(ROOT, '..', '..', 'node_modules', 'expo-camera', 'plugin', 'build', 'withCamera.js'),
      'utf8',
    );
    const option = plugin.match(/(recordAudio\w*)\s*=\s*true/)?.[1];
    expect(option, 'the camera plugin no longer has a record-audio option').toBeDefined();

    const camera = config.plugins?.find(
      (entry): entry is [string, Record<string, unknown>] =>
        Array.isArray(entry) && entry[0] === 'expo-camera',
    );
    expect(camera?.[1][option as string]).toBe(false);
    // iOS: `false` deletes the usage description, so the prompt never exists.
    expect(camera?.[1].microphonePermission).toBe(false);
  });

  it('asks only for what the app actually does', () => {
    expect([...requested].sort()).toEqual(['CAMERA', 'USE_BIOMETRIC', 'USE_FINGERPRINT']);
    expect(requested.filter((name) => /RECORD_AUDIO|MICROPHONE/i.test(name))).toEqual([]);
  });
});
