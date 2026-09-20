import { Pressable, StyleSheet, Text, View, useColorScheme } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createTranslator } from '@cheque-flow/localization';

import { IconAlert } from '@/components/icons';
import { defaultLocale } from '@/lib/config';
import { darkPalette, lightPalette, fontFamily, radius, space, type, type Palette } from '@/theme';

/**
 * What the app shows when a screen's own code throws.
 *
 * Until now there was nothing: expo-router's development overlay in a debug
 * build, and in a release build a blank screen or a silent close, with no
 * message and no way back. A blank screen is the worst possible answer,
 * because it is indistinguishable from a slow one.
 *
 * Deliberately built from nothing the app provides. It takes its palette from
 * the system rather than from `useTheme`, and its words from the catalogue
 * directly rather than from `useTranslator` — because the thing that crashed
 * may be the layout that mounts those providers, and a boundary that needs the
 * broken tree in order to draw is not a boundary.
 */
export function CrashScreen({
  error,
  retry,
}: {
  error: Error;
  /** The router's own retry, which is asynchronous. */
  retry: () => void | Promise<void>;
}) {
  const scheme = useColorScheme();
  const c = scheme === 'dark' ? darkPalette : lightPalette;
  const styles = makeStyles(c);
  const t = createTranslator(defaultLocale());

  return (
    <SafeAreaView style={styles.page}>
      <View style={styles.mark}>
        <IconAlert size={26} color={c.semantic.danger} />
      </View>

      <Text style={styles.title}>{t('errors.crashTitle')}</Text>
      <Text style={styles.body}>{t('errors.crashBody')}</Text>

      <Pressable
        accessibilityRole="button"
        onPress={() => void retry()}
        style={({ pressed }) => [styles.action, pressed && styles.actionDown]}
      >
        <Text style={styles.actionText}>{t('common.retry')}</Text>
      </Pressable>

      {/* The message is the only thread between this screen and whatever the
          person will be asked about it later. Kept small and selectable
          rather than hidden: a screenshot of it is the whole bug report. */}
      <Text style={styles.reference} selectable numberOfLines={4}>
        {error.message}
      </Text>
    </SafeAreaView>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    page: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: space['3'],
      padding: space['6'],
      backgroundColor: c.surface.page,
    },
    mark: {
      width: 56,
      height: 56,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.xl,
      backgroundColor: c.semantic.dangerBg,
    },
    title: { ...type.title, color: c.text.primary, textAlign: 'center' },
    body: {
      ...type.body,
      color: c.text.secondary,
      textAlign: 'center',
      lineHeight: 24,
      maxWidth: 320,
    },
    action: {
      minHeight: 48,
      justifyContent: 'center',
      paddingHorizontal: space['6'],
      borderRadius: radius.lg,
      backgroundColor: c.accent.dark,
      marginTop: space['2'],
    },
    actionDown: { opacity: 0.85 },
    actionText: { ...type.label, color: c.text.onBrand, fontFamily: fontFamily.semibold },
    reference: {
      ...type.caption,
      color: c.text.faint,
      textAlign: 'center',
      marginTop: space['4'],
    },
  });
