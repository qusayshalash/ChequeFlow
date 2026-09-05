import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { Permission } from '@cheque-flow/shared-types';

import {
  IconBell,
  IconChevronEnd,
  IconReports,
  IconSettings,
  IconUser,
  IconUsers,
} from '@/components/icons';
import { useApi, useApp, useTranslator } from '@/components/providers';
import { Banner } from '@/components/ui';
import { TAP, accent, elevation, radius, space, surface, text, type } from '@/theme';

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
      Icon: IconBell,
      label: t('nav.notifications'),
      href: '/(app)/more/notifications',
      allowed: true,
    },
    {
      Icon: IconReports,
      label: t('reports.title'),
      href: '/(app)/more/reports',
      allowed: can(Permission.REPORT_VIEW),
    },
    {
      Icon: IconUsers,
      label: t('user.title'),
      href: '/(app)/more/users',
      allowed: can(Permission.USER_MANAGE),
    },
    { Icon: IconSettings, label: t('nav.settings'), href: '/(app)/more/settings', allowed: true },
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

      {/* Who is signed in, as an identity block rather than a card of three
          equal lines: the name is the answer, the rest is reference. */}
      <View style={styles.identity}>
        <View style={styles.avatar}>
          <IconUser size={22} color={accent.base} />
        </View>
        <View style={styles.identityText}>
          <Text style={styles.name}>{session.data?.name ?? ''}</Text>
          <Text style={styles.meta}>{session.data?.email ?? ''}</Text>
          <Text style={styles.meta}>
            {(session.data?.roles ?? []).map((role) => t(`role.${role}`)).join('، ') || '—'}
          </Text>
        </View>
      </View>

      {/* A list, not a grid of squares. Four destinations do not need to be
          hunted for in two dimensions, and a row fits a full Arabic label
          without wrapping it. */}
      <View style={styles.list}>
        {entries.map((entry, index) => (
          <Pressable
            key={entry.href}
            accessibilityRole="button"
            accessibilityLabel={entry.label}
            onPress={() => router.push(entry.href)}
            style={({ pressed }) => [
              styles.entry,
              index > 0 && styles.divided,
              pressed && styles.pressed,
            ]}
          >
            <entry.Icon size={20} color={text.secondary} />
            <Text style={styles.label}>{entry.label}</Text>
            <IconChevronEnd size={18} color={text.faint} />
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space['4'], gap: space['4'], backgroundColor: 'transparent' },

  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['3'],
    backgroundColor: surface.card,
    borderRadius: radius.xl,
    ...elevation[2],
    padding: space['4'],
  },
  avatar: {
    width: 48,
    height: 48,
    borderRadius: radius.pill,
    backgroundColor: accent.wash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  identityText: { flex: 1, gap: 1 },
  name: { ...type.heading, color: text.primary, textAlign: 'right' },
  meta: { ...type.caption, color: text.secondary, textAlign: 'right' },

  list: {
    backgroundColor: surface.card,
    borderRadius: radius.xl,
    ...elevation[2],
    overflow: 'hidden',
  },
  divided: { borderTopWidth: 1, borderTopColor: surface.line },
  entry: {
    minHeight: TAP + 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['3'],
    paddingHorizontal: space['4'],
    paddingVertical: space['3'],
  },
  pressed: { backgroundColor: surface.sunken },
  label: { ...type.body, color: text.primary, flex: 1, textAlign: 'right' },
});
