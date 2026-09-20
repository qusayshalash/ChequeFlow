import { Link, Stack } from 'expo-router';
import { StyleSheet, Text, View } from 'react-native';

import { useTranslator } from '@/components/providers';
import { space, type, type Palette } from '@/theme';
import { useStyles, useTheme } from '@/theme-context';

/**
 * A route that does not exist.
 *
 * Reachable from a notification pointing at a cheque that has since been
 * deleted, or from a deep link typed by hand. Without this file expo-router
 * shows its own unmatched-route screen, which is in English and offers a
 * developer's "sitemap" — somebody else's debugging tool, in the middle of
 * someone's working day.
 */
export default function NotFoundScreen() {
  const t = useTranslator();
  const c = useTheme();
  const styles = useStyles(makeStyles);

  return (
    <>
      <Stack.Screen options={{ title: t('errors.notFoundTitle') }} />
      <View style={styles.page}>
        <Text style={styles.title}>{t('errors.notFoundTitle')}</Text>
        <Text style={styles.body}>{t('errors.notFoundBody')}</Text>
        <Link href="/(app)" style={[styles.action, { color: c.accent.dark }]}>
          {t('common.home')}
        </Link>
      </View>
    </>
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
    title: { ...type.title, color: c.text.primary, textAlign: 'center' },
    body: { ...type.body, color: c.text.secondary, textAlign: 'center', maxWidth: 300 },
    action: { ...type.label, paddingVertical: space['3'], paddingHorizontal: space['4'] },
  });
