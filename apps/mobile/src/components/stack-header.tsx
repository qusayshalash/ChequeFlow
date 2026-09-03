import { useNavigation, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { MIN_TOUCH_TARGET } from '@cheque-flow/ui/tokens';

import { useApp } from '@/components/providers';
import { accent, space, surface, text } from '@/theme';

/**
 * Back control for the stack headers.
 *
 * The chevron direction is derived from the interface language rather than
 * from `I18nManager`. A layout-direction flip only takes effect after the app
 * restarts, so on the run where the user first switches to Arabic the platform
 * arrow still points the wrong way; deriving it from the locale is correct
 * immediately and on every launch.
 */
export function BackButton() {
  const router = useRouter();
  const navigation = useNavigation();
  const { locale, t } = useApp();

  // Only when there is somewhere to go back to *within this stack*. The global
  // router reports true on a tab root as well, because another tab sits on the
  // history — and an arrow that jumps to a different tab is not a back arrow.
  if (!navigation.canGoBack()) return null;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('common.back')}
      onPress={() => router.back()}
      style={styles.button}
      hitSlop={8}
    >
      <Text style={styles.chevron}>{locale === 'ar' ? '›' : '‹'}</Text>
    </Pressable>
  );
}

/** Shared options for every stack inside the tab bar. */
export function stackScreenOptions() {
  return {
    headerTitleAlign: 'center' as const,
    headerLeft: () => <BackButton />,
    headerStyle: { backgroundColor: surface.card },
    headerTintColor: text.primary,
  };
}

const styles = StyleSheet.create({
  button: {
    minWidth: MIN_TOUCH_TARGET,
    minHeight: MIN_TOUCH_TARGET,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space['2'],
  },
  chevron: { fontSize: 34, lineHeight: 38, color: accent.base, fontWeight: '300' },
});
