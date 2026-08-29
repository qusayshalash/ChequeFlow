import { useQuery } from '@tanstack/react-query';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import type { ContactView } from '@cheque-flow/shared-types';
import { colors, radius, spacing } from '@cheque-flow/ui/tokens';

import { useApi, useTranslator } from '@/components/providers';
import { EmptyView, ErrorView, LoadingView } from '@/components/ui';

export default function ContactsScreen() {
  const api = useApi();
  const t = useTranslator();

  const query = useQuery({
    queryKey: ['contacts', 'mobile'],
    queryFn: () => api.listContacts({ pageSize: 100 }),
  });

  if (query.isPending) return <LoadingView label={t('common.loading')} />;
  if (query.isError) {
    return (
      <ErrorView
        label={t('errors.network')}
        onRetry={() => void query.refetch()}
        retryLabel={t('common.retry')}
      />
    );
  }

  return (
    <View style={styles.container}>
      <FlatList<ContactView>
        data={query.data?.data ?? []}
        keyExtractor={(item) => item.id}
        ListEmptyComponent={<EmptyView label={t('contact.empty')} />}
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <View style={styles.row}>
            <Text style={styles.name}>{item.name}</Text>
            <Text style={styles.meta}>{t(`contactType.${item.type}`)}</Text>
            {item.phone ? <Text style={styles.meta}>{item.phone}</Text> : null}
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.surfaceMuted, padding: spacing.md },
  list: { gap: spacing.sm },
  row: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    minHeight: 72,
    gap: 2,
  },
  name: { fontSize: 16, fontWeight: '600', color: colors.text, textAlign: 'right' },
  meta: { fontSize: 13, color: colors.textMuted, textAlign: 'right' },
});
