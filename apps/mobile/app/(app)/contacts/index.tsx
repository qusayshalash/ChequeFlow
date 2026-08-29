import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ContactType, type ContactView } from '@cheque-flow/shared-types';
import { colors, radius, spacing } from '@cheque-flow/ui/tokens';

import { useApi, useTranslator } from '@/components/providers';
import { Button, EmptyView, ErrorView, LoadingView, SegmentedTabs } from '@/components/ui';

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
        placeholderTextColor={colors.textMuted}
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
              style={[styles.row, !item.isActive && styles.rowInactive]}
              onPress={() => router.push(`/(app)/contacts/${item.id}`)}
            >
              <View style={styles.rowHeader}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.type}>{t(`contactType.${item.type}`)}</Text>
              </View>
              {item.companyName ? <Text style={styles.meta}>{item.companyName}</Text> : null}
              <Text style={styles.meta}>{item.phone ?? t('contact.noPhone')}</Text>
              {!item.isActive ? (
                <Text style={styles.inactiveTag}>{t('userStatus.DISABLED')}</Text>
              ) : null}
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
    backgroundColor: colors.surfaceMuted,
    padding: spacing.md,
    gap: spacing.sm,
  },
  search: {
    minHeight: 48,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    color: colors.text,
    textAlign: 'right',
  },
  list: { gap: spacing.sm, paddingBottom: spacing.md },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 72,
    gap: 2,
  },
  rowInactive: { opacity: 0.6 },
  rowHeader: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  name: { fontSize: 16, fontWeight: '600', color: colors.text, textAlign: 'right', flexShrink: 1 },
  type: { fontSize: 13, color: colors.textMuted },
  meta: { fontSize: 13, color: colors.textMuted, textAlign: 'right' },
  inactiveTag: { fontSize: 12, color: colors.danger, textAlign: 'right' },
});
