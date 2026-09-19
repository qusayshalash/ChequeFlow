/**
 * Which theme the dashboard is painted in.
 *
 * The stylesheet answers the operating system on its own, and for most people
 * that is the end of it: someone who wants dark at night has said so once, for
 * every app on the machine. This exists for the rest — a shared machine set to
 * light, a bright office, a screen photographed for a report — where the
 * person wants this one product to disagree with the system.
 *
 * So the choice has three values, not two. "System" is not the absence of a
 * setting; it is the setting most people should be on, and it has to be
 * reachable again after someone has picked light or dark.
 */

export const THEME_CHOICES = ['system', 'light', 'dark'] as const;

export type ThemeChoice = (typeof THEME_CHOICES)[number];

export const DEFAULT_THEME_CHOICE: ThemeChoice = 'system';

/** Where the choice is kept. Also written into the pre-paint script below. */
export const THEME_STORAGE_KEY = 'chequeflow.theme';

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return typeof value === 'string' && (THEME_CHOICES as readonly string[]).includes(value);
}

/**
 * Puts a choice into effect.
 *
 * "System" removes the attribute rather than writing one, which is what hands
 * the question back to the `prefers-color-scheme` block in the stylesheet. The
 * two explicit values are written out, and the `:not([data-theme='light'])`
 * guard there is what lets an explicit light win over a dark system.
 */
export function applyThemeChoice(choice: ThemeChoice, root: HTMLElement): void {
  if (choice === 'system') {
    root.removeAttribute('data-theme');
    return;
  }
  root.setAttribute('data-theme', choice);
}

/** The stored choice, or the default when nothing is stored or storage refuses. */
export function readThemeChoice(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(stored) ? stored : DEFAULT_THEME_CHOICE;
  } catch {
    // Private windows and blocked site data both throw here. A theme is not
    // worth failing a page load over.
    return DEFAULT_THEME_CHOICE;
  }
}

export function storeThemeChoice(choice: ThemeChoice): void {
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    // The choice still applies to this tab; it just will not be remembered.
  }
}

/**
 * The same decision, small enough to run before the first paint.
 *
 * It has to be inline and synchronous in `<head>`: a choice applied from a
 * React effect arrives after the browser has already painted, and the person
 * sees the system's theme flash before their own replaces it. That flash is
 * the entire reason this string exists rather than a `useEffect`.
 */
export const THEME_BOOT_SCRIPT = `try{var c=localStorage.getItem('${THEME_STORAGE_KEY}');if(c==='light'||c==='dark')document.documentElement.setAttribute('data-theme',c)}catch(e){}`;
