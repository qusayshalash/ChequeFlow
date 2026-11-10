import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatusBar } from 'expo-status-bar';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
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
 * Dark unless someone chooses otherwise, as on the web: the product's look is
 * the dark one. Light, or following the phone, is a choice on the More screen,
 * kept on this phone. It used to follow the phone only; the product's look
 * changed, and the phone's setting can no longer be the only answer.
 */
export const THEME_CHOICES = ['system', 'light', 'dark'] as const;
export type ThemeChoice = (typeof THEME_CHOICES)[number];
export const DEFAULT_THEME_CHOICE: ThemeChoice = 'dark';
const THEME_KEY = 'chequeflow.theme';

const ThemeContext = createContext<Palette>(darkPalette);
const ChoiceContext = createContext<{
  choice: ThemeChoice;
  setChoice: (next: ThemeChoice) => void;
}>({ choice: DEFAULT_THEME_CHOICE, setChoice: () => undefined });

export function ThemeProvider({ children }: { children: ReactNode }) {
  const scheme = useColorScheme();
  const [choice, setChoiceState] = useState<ThemeChoice>(DEFAULT_THEME_CHOICE);

  useEffect(() => {
    AsyncStorage.getItem(THEME_KEY)
      .then((stored) => {
        if (stored && (THEME_CHOICES as readonly string[]).includes(stored)) {
          setChoiceState(stored as ThemeChoice);
        }
      })
      // Storage that refuses is not worth a broken start; dark it is.
      .catch(() => undefined);
  }, []);

  const setChoice = useCallback((next: ThemeChoice) => {
    setChoiceState(next);
    AsyncStorage.setItem(THEME_KEY, next).catch(() => undefined);
  }, []);

  const dark = choice === 'dark' || (choice === 'system' && scheme !== 'light');
  const palette = dark ? darkPalette : lightPalette;
  const choiceValue = useMemo(() => ({ choice, setChoice }), [choice, setChoice]);

  return (
    <ChoiceContext.Provider value={choiceValue}>
      <ThemeContext.Provider value={palette}>
        {/* The bar's icons follow the app's ground, not the phone's setting:
            a dark app on a phone set to light would otherwise draw dark icons
            on a dark page. */}
        <StatusBar style={palette.dark ? 'light' : 'dark'} />
        {children}
      </ThemeContext.Provider>
    </ChoiceContext.Provider>
  );
}

/** The current palette — for a gradient, a status bar, an icon's colour. */
export function useTheme(): Palette {
  return useContext(ThemeContext);
}

/** The stored choice and its setter, for the More screen. */
export function useThemeChoice() {
  return useContext(ChoiceContext);
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
