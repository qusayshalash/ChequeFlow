import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ContactType, type ContactView } from '@cheque-flow/shared-types';
import { colors } from '@cheque-flow/ui/tokens';

import { IconChevronEnd, IconPhone } from '@/components/icons';
import { useApi, useTranslator } from '@/components/providers';
import { Button, EmptyView, ErrorView, LoadingView, SegmentedTabs } from '@/components/ui';
import { TAP, accent, radius, space, surface, text, type } from '@/theme';

const TYPE_TABS = ['ALL', ContactType.CUSTOMER, ContactType.SUPPLIER, ContactType.PERSON] as const;

export default function ContactsScreen() {
  const api = useApi();
  const t = useTranslator();
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [type, setType] = useState<string>('ALL');

  const query = useQuery({
    queryKey: ['contacts', { search, type }],
    queryFn: () =>
      api.listContacts({
        pageSize: 100,
        ...(search ? { search } : {}),
        ...(type === 'ALL' ? {} : { type: type as ContactType }),
      }),
  });

  return (
    <View style={styles.container}>
      <SegmentedTabs
        options={TYPE_TABS.map((value) => ({
          value,
          label: value === 'ALL' ? t('cheque.tabAll') : t(`contactType.${value}`),
        }))}
        value={type}
        onChange={setType}
      />

      <TextInput
        style={styles.search}
        placeholder={t('contact.searchPlaceholder')}
        placeholderTextColor={text.secondary}
        value={search}
        onChangeText={setSearch}
        accessibilityLabel={t('common.search')}
      />

      {query.isPending ? <LoadingView label={t('common.loading')} /> : null}
      {query.isError ? (
        <ErrorView
          label={t('errors.loadFailed')}
          onRetry={() => void query.refetch()}
          retryLabel={t('common.retry')}
        />
      ) : null}

      {query.data ? (
        <FlatList<ContactView>
          data={query.data.data}
          keyExtractor={(item) => item.id}
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
          ListEmptyComponent={
            <EmptyView
              label={t('contact.empty')}
              actionLabel={t('contact.newTitle')}
              onAction={() => router.push('/(app)/contacts/new')}
            />
          }
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={item.name}
              style={({ pressed }) => [styles.row, pressed && styles.rowDown]}
              onPress={() => router.push(`/(app)/contacts/${item.id}`)}
            >
              {/* An initial rather than a generic person icon: in a list of
                  twenty customers the letter is what tells them apart. */}
              <View style={[styles.avatar, !item.isActive && styles.avatarOff]}>
                <Text style={styles.initial}>{item.name.trim().charAt(0) || '؟'}</Text>
              </View>

              <View style={styles.rowBody}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.name}
                </Text>
                <Text style={styles.meta} numberOfLines={1}>
                  {item.companyName ?? t(`contactType.${item.type}`)}
                </Text>
                {/* A missing number is what stops a reminder being sent, so it
                    is said rather than shown as an empty line. */}
                <View style={styles.phoneRow}>
                  <IconPhone size={13} color={item.phone ? text.faint : colors.warning} />
                  <Text style={[styles.phone, !item.phone && styles.phoneMissing]}>
                    {item.phone ?? t('contact.noPhone')}
                  </Text>
                </View>
              </View>

              {!item.isActive ? (
                <Text style={styles.inactiveTag}>{t('userStatus.DISABLED')}</Text>
              ) : (
                <IconChevronEnd size={18} color={text.faint} />
              )}
            </Pressable>
          )}
        />
      ) : null}

      <Button
        label={t('contact.newTitle')}
        onPress={() => router.push('/(app)/contacts/new')}
        large
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: surface.page,
    padding: space['4'],
    gap: space['2'],
  },
  search: {
    minHeight: TAP,
    borderWidth: 1,
    borderColor: surface.lineStrong,
    borderRadius: radius.md,
    backgroundColor: surface.card,
    paddingHorizontal: space['4'],
    ...type.body,
    color: text.primary,
    textAlign: 'right',
  },
  list: { gap: space['2'], paddingBottom: space['4'] },

  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['3'],
    backgroundColor: surface.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: surface.line,
    padding: space['3'],
    minHeight: 76,
  },
  rowDown: { backgroundColor: surface.sunken },
  avatar: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    backgroundColor: accent.wash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarOff: { backgroundColor: surface.sunken },
  initial: { ...type.heading, color: accent.dark },

  rowBody: { flex: 1, gap: 1 },
  name: { ...type.bodyStrong, color: text.primary, textAlign: 'right' },
  meta: { ...type.caption, color: text.secondary, textAlign: 'right' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: space['1'], marginTop: 1 },
  phone: { ...type.caption, color: text.faint, writingDirection: 'ltr' },
  phoneMissing: { color: colors.warning },
  inactiveTag: { ...type.caption, color: colors.danger },
});
