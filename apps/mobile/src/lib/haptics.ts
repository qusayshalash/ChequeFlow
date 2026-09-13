import * as Haptics from 'expo-haptics';

/**
 * What the phone says with a vibration.
 *
 * Named for the moment rather than the waveform: a screen should ask for
 * `recorded()` when a cheque is filed, not for a "notification success type",
 * so the decision about how that feels is made once, here.
 *
 * Only for moments that change the books or refuse to. A buzz on every tap is
 * noise, and noise is what makes people turn the feature off in Settings —
 * where it goes off for every app, including the ones that used it well.
 *
 * Every call is fire-and-forget. Haptics are unavailable on a simulator, on
 * some Android hardware, and whenever the owner has switched them off; none of
 * those is a reason for an action to fail, so the promise is dropped rather
 * than awaited or reported.
 */

function fire(run: () => Promise<void>): void {
  void run().catch(() => {
    // Silence is the correct handling: the action already happened.
  });
}

/** A cheque was recorded, an action went through, a batch was applied. */
export function recorded(): void {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success));
}

/** Something needs a decision before it can go through — a duplicate, a blocked row. */
export function needsAttention(): void {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning));
}

/** The action was refused: a validation error, a failed request. */
export function refused(): void {
  fire(() => Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error));
}

/** A photograph was taken — the shutter's own confirmation. */
export function captured(): void {
  fire(() => Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light));
}

/** A row entered or left a selection. */
export function selected(): void {
  fire(() => Haptics.selectionAsync());
}
