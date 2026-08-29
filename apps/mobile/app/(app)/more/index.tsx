import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Permission } from '@cheque-flow/shared-types';
import { colors, radius, spacing } from '@cheque-flow/ui/tokens';

import { useApi, useApp, useTranslator } from '@/components/providers';
import { Banner, Card, Heading } from '@/components/ui';

/**
 * Everything that is not a daily destination.
 *
 * Entries the signed-in user has no permission for are not shown at all —
 * offering a screen that will answer with a permission error is worse than
 * not offering it.
 */
export default function MoreScreen() {
  const api = useApi();
  const t = useTranslator();
  const router = useRouter();
  const { online, checkConnection } = useApp();

  const session = useQuery({ queryKey: ['session'], queryFn: () => api.me() });
  const permissions = session.data?.permissions ?? [];
  const can = (permission: string): boolean => permissions.includes(permission);

  const entries = [
    {
      glyph: '🔔',
      label: t('nav.notifications'),
      href: '/(app)/more/notifications',
      allowed: true,
    },
    {
      glyph: '📊',
      label: t('reports.title'),
      href: '/(app)/more/reports',
      allowed: can(Permission.REPORT_VIEW),
    },
    {
      glyph: '👤',
      label: t('user.title'),
      href: '/(app)/more/users',
      allowed: can(Permission.USER_MANAGE),
    },
    { glyph: '⚙️', label: t('nav.settings'), href: '/(app)/more/settings', allowed: true },
  ].filter((entry) => entry.allowed);

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {!online ? (
        <Banner
          text={t('common.offline')}
          actionLabel={t('common.syncNow')}
          onAction={() => void checkConnection()}
        />
      ) : null}

      <Card>
        <Heading>{session.data?.name ?? ''}</Heading>
        <Text style={styles.meta}>{session.data?.email ?? ''}</Text>
        <Text style={styles.meta}>
          {t('user.roles')}:{' '}
          {(session.data?.roles ?? []).map((role) => t(`role.${role}`)).join('، ') || '—'}
        </Text>
      </Card>

      <View style={styles.grid}>
        {entries.map((entry) => (
          <Pressable
            key={entry.href}
            accessibilityRole="button"
            accessibilityLabel={entry.label}
            onPress={() => router.push(entry.href)}
            style={({ pressed }) => [styles.entry, pressed && styles.pressed]}
          >
            <Text style={styles.glyph}>{entry.glyph}</Text>
            <Text style={styles.label}>{entry.label}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.md, backgroundColor: colors.surfaceMuted },
  meta: { fontSize: 13, color: colors.textMuted, textAlign: 'right' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  entry: {
    flexGrow: 1,
    flexBasis: '45%',
    minHeight: 96,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
  },
  pressed: { opacity: 0.75 },
  glyph: { fontSize: 26 },
  label: { fontSize: 15, color: colors.text, textAlign: 'center' },
});
