import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { ContactType, type ContactListItemView } from '@cheque-flow/shared-types';
import { colors } from '@cheque-flow/ui/tokens';

import { IconChevronEnd, IconPhone } from '@/components/icons';
import { ContactAvatar } from '@/components/marks';
import { useApi, useApp, useTranslator } from '@/components/providers';
import { Button, EmptyView, ErrorView, LoadingView, SegmentedTabs } from '@/components/ui';
import { TAP, elevation, radius, space, surface, text, type } from '@/theme';

const TYPE_TABS = ['ALL', ContactType.CUSTOMER, ContactType.SUPPLIER, ContactType.PERSON] as const;

export default function ContactsScreen() {
  const api = useApi();
  const t = useTranslator();
  const { money } = useApp();
  const router = useRouter();

  const [search, setSearch] = useState('');
  const [type, setType] = useState<string>('ALL');

  /**
   * One count per tab, fetched as the smallest page the API will return: the
   * number wanted is `meta.total`, and pulling a page of contacts to read a
   * total off it would move real rows over the wire for nothing. The search
   * box is part of the key, so the counts describe what the tabs would
   * actually show rather than the whole address book.
   */
  const counts = useQuery({
    queryKey: ['contacts', 'counts', { search }],
    queryFn: async () => {
      const q = search ? { search } : {};
      const [all, customers, suppliers, people] = await Promise.all([
        api.listContacts({ ...q, pageSize: 1 }),
        api.listContacts({ ...q, pageSize: 1, type: ContactType.CUSTOMER }),
        api.listContacts({ ...q, pageSize: 1, type: ContactType.SUPPLIER }),
        api.listContacts({ ...q, pageSize: 1, type: ContactType.PERSON }),
      ]);
      return {
        ALL: all.meta.total,
        [ContactType.CUSTOMER]: customers.meta.total,
        [ContactType.SUPPLIER]: suppliers.meta.total,
        [ContactType.PERSON]: people.meta.total,
      };
    },
  });

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
        options={TYPE_TABS.map((value) => {
          const count = counts.data?.[value];
          return {
            value,
            label: value === 'ALL' ? t('cheque.tabAll') : t(`contactType.${value}`),
            // Passed as a number, not glued into the label, so the control can
            // draw it as a badge. Still omitted while the request is out: a tab
            // reading "عملاء 0" before the answer arrives is wrong, not pending.
            ...(count === undefined ? {} : { count }),
          };
        })}
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
        <FlatList<ContactListItemView>
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
                  twenty customers the letter is what tells them apart. The
                  colour is hashed from the name, so a contact keeps the same
                  one here and everywhere else. */}
              <ContactAvatar name={item.name} muted={!item.isActive} />

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

              {/* What the list is actually scanned for. One line per currency:
                  a single figure would mean adding dollars to shekels, and
                  there is no honest rate at which to do that. */}
              <View style={styles.money}>
                {item.balances.length === 0 ? (
                  <Text style={styles.settled}>{t('contact.settled')}</Text>
                ) : (
                  item.balances.map((balance) => {
                    const owed = !balance.net.startsWith('-');
                    return (
                      <Text
                        key={balance.currency}
                        style={[styles.balance, owed ? styles.balanceOwed : styles.balanceWeOwe]}
                        numberOfLines={1}
                      >
                        {money(balance.net, balance.currency)}
                      </Text>
                    );
                  })
                )}
                {item.chequeCount > 0 ? (
                  <Text style={styles.chequeCount}>
                    {item.chequeCount} · {t('contact.chequeCount')}
                  </Text>
                ) : null}
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
    backgroundColor: 'transparent',
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
    borderRadius: radius.xl,
    ...elevation[2],
    padding: space['3'],
    minHeight: 76,
  },
  rowDown: { backgroundColor: surface.sunken },
  rowBody: { flex: 1, gap: 1 },
  name: { ...type.bodyStrong, color: text.primary, textAlign: 'right' },
  meta: { ...type.caption, color: text.secondary, textAlign: 'right' },
  phoneRow: { flexDirection: 'row', alignItems: 'center', gap: space['1'], marginTop: 1 },
  phone: { ...type.caption, color: text.faint, writingDirection: 'ltr' },
  phoneMissing: { color: colors.warning },
  money: { alignItems: 'flex-start', gap: 1, maxWidth: 130 },
  balance: { ...type.label, writingDirection: 'ltr' },
  balanceOwed: { color: '#12805C' },
  balanceWeOwe: { color: colors.danger },
  settled: { ...type.caption, color: text.faint },
  chequeCount: { ...type.caption, fontSize: 11, color: text.faint },

  inactiveTag: { ...type.caption, color: colors.danger },
});
