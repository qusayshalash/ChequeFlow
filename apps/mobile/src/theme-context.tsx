import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useColorScheme, type StyleSheet } from 'react-native';

import { darkPalette, lightPalette, type Palette } from '@/theme';

/**
 * Which palette the app is painted in, and how a screen gets its styles.
 *
 * React Native has no cascade: a colour is a value copied into a style object
 * when the module loads, not a variable the renderer reads later. So a theme
 * that can change at runtime cannot be a set of constants — every screen has
 * to build its styles from whichever palette is current.
 *
 * `useStyles` is the whole of it. A screen writes its stylesheet as a function
 * of the palette and calls this; the result is built once per palette and
 * cached, so switching themes does not rebuild every screen's styles on every
 * render, and staying in one theme costs a map lookup.
 *
 * The phone decides. There is no in-app switch: someone who wants dark at
 * night has already said so in Settings, and an app that asks again is an app
 * that ignores the answer.
 */
const ThemeContext = createContext<Palette>(lightPalette);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const palette = scheme === 'dark' ? darkPalette : lightPalette;

  return <ThemeContext.Provider value={palette}>{children}</ThemeContext.Provider>;
}

/** The current palette — for a gradient, a status bar, an icon's colour. */
export function useTheme(): Palette {
  return useContext(ThemeContext);
}

type Styles = ReturnType<typeof StyleSheet.create>;

/**
 * Styles for the palette in force.
 *
 * Cached per factory *and* per palette: the same screen in the same theme gets
 * the same object every render, so `StyleSheet.create` is not called on a
 * scroll and pure children do not re-render for a new style reference.
 */
const cache = new WeakMap<(palette: Palette) => Styles, Map<Palette, Styles>>();

export function useStyles<T extends Styles>(factory: (palette: Palette) => T): T {
  const palette = useTheme();

  return useMemo(() => {
    let perPalette = cache.get(factory);
    if (!perPalette) {
      perPalette = new Map();
      cache.set(factory, perPalette);
    }

    const existing = perPalette.get(palette);
    if (existing) return existing as T;

    const built = factory(palette);
    perPalette.set(palette, built);
    return built;
  }, [factory, palette]);
}
