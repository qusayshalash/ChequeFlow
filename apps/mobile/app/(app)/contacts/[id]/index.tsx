import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiClientError } from '@cheque-flow/api-client';
import type { ContactStatementView } from '@cheque-flow/shared-types';
import { colors } from '@cheque-flow/ui/tokens';

import { IconMessage, IconPhone } from '@/components/icons';
import { ContactAvatar } from '@/components/marks';
import { useApi, useApp, useTranslator } from '@/components/providers';
import {
  Badge,
  Banner,
  Body,
  Button,
  Card,
  ErrorView,
  Heading,
  InfoRow,
  LoadingView,
  Picker,
  Section,
  Sheet,
  StatusPill,
} from '@/components/ui';
import { accent, elevation, radius, space, surface, text } from '@/theme';

/**
 * One contact's account statement.
 *
 * Shows what they still owe, what they paid and what came back — per currency,
 * because a single combined figure across currencies would be meaningless —
 * followed by the cheques themselves.
 */
export default function ContactStatementScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const t = useTranslator();
  const { money, date } = useApp();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTarget, setMergeTarget] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const query = useQuery<ContactStatementView>({
    queryKey: ['contact-statement', id],
    queryFn: () => api.getContactStatement(id),
    enabled: Boolean(id),
  });

  const others = useQuery({
    queryKey: ['contacts', 'merge-targets'],
    enabled: mergeOpen,
    queryFn: () => api.listContacts({ pageSize: 100, isActive: true }),
  });

  const removal = useMutation({
    mutationFn: () => api.deleteContact(id),
    onSuccess: (result) => {
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
      // The API deactivates instead of deleting when cheques reference the
      // contact; say which happened rather than claiming a deletion.
      if (result.deleted) router.back();
      else setNotice(t('contact.deactivated'));
    },
    onError: (error: unknown) => {
      setNotice(error instanceof ApiClientError ? t(error.messageKey) : t('errors.saveFailed'));
    },
  });

  const merge = useMutation({
    mutationFn: (targetId: string) => api.mergeContacts({ sourceId: id, targetId }),
    onSuccess: (target) => {
      void queryClient.invalidateQueries({ queryKey: ['contacts'] });
      void queryClient.invalidateQueries({ queryKey: ['cheques'] });
      setMergeOpen(false);
      router.replace(`/(app)/contacts/${target.id}`);
    },
    onError: (error: unknown) => {
      setNotice(error instanceof ApiClientError ? t(error.messageKey) : t('errors.saveFailed'));
    },
  });

  if (query.isPending) return <LoadingView label={t('common.loading')} />;
  if (query.isError || !query.data) {
    return (
      <ErrorView
        label={t('errors.loadFailed')}
        onRetry={() => void query.refetch()}
        retryLabel={t('common.retry')}
      />
    );
  }

  const { contact, currencies, cheques, totalCheques } = query.data;

  /** Opens the phone dialler or WhatsApp for this contact. */
  async function reach(scheme: 'tel' | 'whatsapp'): Promise<void> {
    const phone = contact.phone?.replace(/[^\d+]/g, '');
    if (!phone) return;
    const url = scheme === 'tel' ? `tel:${phone}` : `https://wa.me/${phone.replace(/^\+/, '')}`;
    const supported = await Linking.canOpenURL(url);
    if (supported) await Linking.openURL(url);
    else Alert.alert(t('errors.loadFailed'));
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* The same mark the list draws, so arriving here confirms you opened
          the contact you meant to. A colour that changed between the two
          screens would make it useless in both. */}
      <View style={styles.header}>
        <ContactAvatar name={contact.name} size={56} muted={!contact.isActive} />
        <View style={styles.headerText}>
          <Heading>{contact.name}</Heading>
          <Text style={styles.meta}>{t(`contactType.${contact.type}`)}</Text>
          {contact.companyName ? <Text style={styles.meta}>{contact.companyName}</Text> : null}
          {!contact.isActive ? <Badge label={t('userStatus.DISABLED')} /> : null}
        </View>
      </View>

      {notice ? <Banner tone="info" text={notice} /> : null}

      {contact.phone ? (
        <View style={styles.reachRow}>
          <Pressable
            accessibilityRole="button"
            style={styles.reachButton}
            onPress={() => void reach('tel')}
          >
            <IconPhone size={22} color={accent.base} />
            <Text style={styles.reachLabel}>{t('common.call')}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            style={styles.reachButton}
            onPress={() => void reach('whatsapp')}
          >
            <IconMessage size={22} color={accent.base} />
            <Text style={styles.reachLabel}>{t('common.whatsapp')}</Text>
          </Pressable>
        </View>
      ) : null}

      <Section title={t('contact.title')}>
        <InfoRow label={t('contact.phone')} value={contact.phone ?? '—'} ltr />
        <InfoRow label={t('contact.email')} value={contact.email ?? '—'} ltr />
        <InfoRow label={t('contact.nationalId')} value={contact.nationalId ?? '—'} ltr />
        <InfoRow label={t('contact.taxNumber')} value={contact.taxNumber ?? '—'} ltr />
        <InfoRow label={t('contact.address')} value={contact.address ?? '—'} />
      </Section>

      {currencies.length === 0 ? (
        <Card>
          <Body muted>{t('cheque.emptyList')}</Body>
        </Card>
      ) : (
        currencies.map((totals) => (
          <Section key={totals.currency} title={`${t('contact.statement')} — ${totals.currency}`}>
            <InfoRow
              label={`${t('contact.pending')} (${totals.pending.count})`}
              value={money(totals.pending.total, totals.currency)}
            />
            <InfoRow
              label={`${t('contact.collected')} (${totals.collected.count})`}
              value={money(totals.collected.total, totals.currency)}
            />
            <InfoRow
              label={`${t('contact.bounced')} (${totals.bounced.count})`}
              value={money(totals.bounced.total, totals.currency)}
            />
            <InfoRow
              label={`${t('contact.returned')} (${totals.returned.count})`}
              value={money(totals.returned.total, totals.currency)}
            />
          </Section>
        ))
      )}

      <Card>
        <Text style={styles.sectionTitle}>{t('cheque.listTitle')}</Text>
        {/* The totals above cover everything; this list does not. Saying so
            stops the two looking like they disagree. */}
        {totalCheques > cheques.length ? (
          <Body muted>{t('contact.statementLimited', { count: cheques.length })}</Body>
        ) : null}
        {cheques.length === 0 ? (
          <Body muted>{t('cheque.emptyList')}</Body>
        ) : (
          cheques.map((cheque) => (
            <Pressable
              key={cheque.id}
              accessibilityRole="button"
              style={styles.chequeRow}
              onPress={() => router.push(`/(app)/cheques/${cheque.id}`)}
            >
              <View style={styles.chequeHeader}>
                <Text style={styles.chequeNumber}>{cheque.chequeNumber}</Text>
                <StatusPill status={cheque.status} label={t(`status.${cheque.status}`)} />
              </View>
              <View style={styles.chequeMeta}>
                <Text style={styles.meta}>{money(cheque.amount, cheque.currency)}</Text>
                <Text style={[styles.meta, cheque.isOverdue && styles.overdue]}>
                  {date(cheque.dueDate)}
                </Text>
              </View>
            </Pressable>
          ))
        )}
      </Card>

      <Button
        label={t('common.edit')}
        variant="secondary"
        onPress={() => router.push(`/(app)/contacts/${id}/edit`)}
      />
      <Button label={t('contact.merge')} variant="secondary" onPress={() => setMergeOpen(true)} />
      <Button
        label={t('common.delete')}
        variant="danger"
        loading={removal.isPending}
        onPress={() => {
          Alert.alert(t('common.confirmDelete'), contact.name, [
            { text: t('common.cancel'), style: 'cancel' },
            { text: t('common.delete'), style: 'destructive', onPress: () => removal.mutate() },
          ]);
        }}
      />

      <Sheet visible={mergeOpen} title={t('contact.merge')} onClose={() => setMergeOpen(false)}>
        <Body muted>
          {t('contact.mergeConfirm', {
            source: contact.name,
            target:
              (others.data?.data ?? []).find((entry) => entry.id === mergeTarget)?.name ?? '…',
          })}
        </Body>
        <Picker
          label={t('contact.mergeInto')}
          options={(others.data?.data ?? [])
            .filter((entry) => entry.id !== id)
            .map((entry) => ({ value: entry.id, label: entry.name }))}
          value={mergeTarget}
          onChange={setMergeTarget}
          emptyLabel={t('contact.empty')}
        />
        <Button
          label={t('common.confirm')}
          disabled={!mergeTarget}
          loading={merge.isPending}
          onPress={() => mergeTarget && merge.mutate(mergeTarget)}
          large
        />
      </Sheet>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: space['4'],
    gap: space['4'],
    backgroundColor: 'transparent',
    paddingBottom: space['16'],
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: surface.card,
    borderRadius: radius.xl,
    ...elevation[2],
    padding: space['4'],
    gap: space['3'],
  },
  headerText: { flex: 1, gap: 4, alignItems: 'flex-end' },
  meta: { fontSize: 13, color: text.secondary, textAlign: 'right' },
  overdue: { color: colors.danger, fontWeight: '700' },
  sectionTitle: { fontSize: 16, fontWeight: '700', color: text.primary, textAlign: 'right' },
  reachRow: { flexDirection: 'row', gap: space['2'] },
  reachButton: {
    flex: 1,
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    backgroundColor: surface.card,
    borderRadius: radius.xl,
    ...elevation[2],
  },
  reachLabel: { fontSize: 13, color: text.primary },
  chequeRow: {
    gap: 4,
    paddingVertical: space['2'],
    borderTopWidth: 1,
    borderTopColor: surface.line,
  },
  chequeHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  chequeNumber: { fontSize: 15, fontWeight: '700', color: text.primary, writingDirection: 'ltr' },
  chequeMeta: { flexDirection: 'row', justifyContent: 'space-between', gap: space['2'] },
});
