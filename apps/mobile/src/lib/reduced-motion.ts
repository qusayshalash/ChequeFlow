import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

import { motion } from '@/theme';

/**
 * Movement, for someone who has asked the phone to hold still.
 *
 * "Reduce Motion" is not a preference about taste. It is switched on by people
 * for whom a panel sliding under their eyes causes nausea or a migraine, and
 * both platforms expose it precisely so an app can answer it. The app's two
 * animations are small, but small is not the same as none.
 *
 * The answer is a duration of zero rather than a skipped animation. The values
 * being animated carry the final opacity and offset as well as the travel, so
 * an animation that never runs leaves a panel stranded at invisible; one that
 * runs in no time puts it exactly where it belongs, in a single frame. Nothing
 * else about the screens changes, which is why the decision lives here and not
 * in each of them.
 */

const STILL = { enter: 0, exit: 0 } as const;

/** Whether the owner has asked for less movement. Follows the setting live. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let watching = true;
    void AccessibilityInfo.isReduceMotionEnabled()
      .then((value) => {
        if (watching) setReduced(value);
      })
      .catch(() => {
        // A platform that cannot say is treated as not asking: the setting is
        // absent, not switched on.
      });
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => {
      watching = false;
      subscription.remove();
    };
  }, []);

  return reduced;
}

/**
 * How long an entrance and an exit may take on this phone, right now.
 *
 * Every timed animation in the app reads its duration from here, so the
 * setting cannot be honoured on one surface and forgotten on the next.
 */
export function useMotionDurations(): { enter: number; exit: number } {
  return useReducedMotion() ? STILL : motion;
}
