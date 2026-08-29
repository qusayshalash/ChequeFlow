import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiClientError } from '@cheque-flow/api-client';
import { ChequeAction, type ChequeDetailView } from '@cheque-flow/shared-types';
import { colors, radius, spacing } from '@cheque-flow/ui/tokens';

import { useApi, useTranslator } from '@/components/providers';
import { Body, Button, Card, Heading, LoadingView } from '@/components/ui';

const NEEDS_CONTACT = new Set<string>([ChequeAction.RECEIVE, ChequeAction.HANDOVER]);
const NEEDS_LOCATION = new Set<string>([ChequeAction.RECEIVE, ChequeAction.DEPOSIT]);
const NEEDS_REASON = new Set<string>([
  ChequeAction.BOUNCE,
  ChequeAction.RETURN,
  ChequeAction.CANCEL,
  ChequeAction.MARK_LOST,
]);

/** Records a custody movement from the phone. */
export default function PerformActionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const t = useTranslator();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<string | null>(null);
  const [contactId, setContactId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);

  const cheque = useQuery<ChequeDetailView>({
    queryKey: ['cheque', id],
    queryFn: () => api.getCheque(id),
    enabled: Boolean(id),
  });
  const contacts = useQuery({
    queryKey: ['contacts', 'all'],
    queryFn: () => api.listContacts({ pageSize: 100 }),
  });
  const locations = useQuery({ queryKey: ['locations'], queryFn: () => api.listLocations() });

  const mutation = useMutation({
    mutationFn: async (action: string) => {
      const version = cheque.data?.version;
      switch (action) {
        case ChequeAction.RECEIVE:
          return api.receiveCheque(id, {
            fromContactId: contactId,
            toLocationId: locationId,
            notes: reason || undefined,
            version,
          });
        case ChequeAction.HANDOVER:
          return api.handoverCheque(id, {
            toContactId: contactId,
            toLocationId: locationId || undefined,
            notes: reason || undefined,
            version,
          });
        case ChequeAction.DEPOSIT:
          return api.depositCheque(id, {
            toLocationId: locationId,
            notes: reason || undefined,
            version,
          });
        case ChequeAction.CLEAR:
          return api.clearCheque(id, { notes: reason || undefined, version });
        case ChequeAction.BOUNCE:
          return api.bounceCheque(id, { reason, version });
        case ChequeAction.RETURN:
          return api.returnCheque(id, { reason, version });
        case ChequeAction.CANCEL:
          return api.cancelCheque(id, { reason, version });
        case ChequeAction.MARK_LOST:
          return api.markChequeLost(id, { reason, version });
        default:
          throw new Error(`Unsupported action: ${action}`);
      }
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cheque', id] });
      void queryClient.invalidateQueries({ queryKey: ['cheque-events', id] });
      router.back();
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiClientError ? t(caught.messageKey) : t('errors.network'));
    },
  });

  if (cheque.isPending) return <LoadingView label={t('common.loading')} />;

  const actions = cheque.data?.allowedActions ?? [];

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Heading>{t('common.actions')}</Heading>

      <View style={styles.actions}>
        {actions.map((action) => (
          <Button
            key={action}
            label={t(`action.${action}`)}
            variant={selected === action ? 'primary' : 'secondary'}
            onPress={() => {
              setSelected(action);
              setError(null);
            }}
          />
        ))}
        {actions.length === 0 ? <Body muted>{t('common.noResults')}</Body> : null}
      </View>

      {selected ? (
        <Card>
          {NEEDS_CONTACT.has(selected) ? (
            <>
              <Text style={styles.label}>{t('cheque.originalSource')}</Text>
              {(contacts.data?.data ?? []).slice(0, 8).map((contact) => (
                <Button
                  key={contact.id}
                  label={contact.name}
                  variant={contactId === contact.id ? 'primary' : 'secondary'}
                  onPress={() => setContactId(contact.id)}
                />
              ))}
            </>
          ) : null}

          {NEEDS_LOCATION.has(selected) ? (
            <>
              <Text style={styles.label}>{t('cheque.currentLocation')}</Text>
              {(locations.data ?? []).map((location) => (
                <Button
                  key={location.id}
                  label={location.name}
                  variant={locationId === location.id ? 'primary' : 'secondary'}
                  onPress={() => setLocationId(location.id)}
                />
              ))}
            </>
          ) : null}

          <Text style={styles.label}>
            {NEEDS_REASON.has(selected) ? t('common.reason') : t('common.notes')}
          </Text>
          <TextInput style={styles.input} value={reason} onChangeText={setReason} multiline />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Button
            label={t('common.confirm')}
            onPress={() => mutation.mutate(selected)}
            loading={mutation.isPending}
            large
          />
        </Card>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.md, backgroundColor: colors.surfaceMuted },
  actions: { gap: spacing.sm },
  label: { fontSize: 14, color: colors.textMuted, textAlign: 'right' },
  input: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    padding: spacing.sm,
    fontSize: 16,
    textAlign: 'right',
    backgroundColor: colors.surface,
  },
  error: { color: colors.danger, fontSize: 14, textAlign: 'right' },
});
