import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { ApiClientError } from '@cheque-flow/api-client';
import { ChequeAction, type ChequeDetailView } from '@cheque-flow/shared-types';

import { useApi, useApp, useTranslator } from '@/components/providers';
import {
  Banner,
  Body,
  Button,
  Card,
  DateField,
  ErrorView,
  Field,
  LoadingView,
  Picker,
  Section,
} from '@/components/ui';
import { isValidDate, todayIso } from '@/lib/dates';
import { space } from '@/theme';

/** Which extra inputs each action needs. Drives the whole form. */
const NEEDS_CONTACT = new Set<string>([
  ChequeAction.RECEIVE,
  ChequeAction.HANDOVER,
  ChequeAction.RETURN,
]);
const NEEDS_LOCATION = new Set<string>([ChequeAction.RECEIVE, ChequeAction.DEPOSIT]);
const NEEDS_REASON = new Set<string>([
  ChequeAction.BOUNCE,
  ChequeAction.RETURN,
  ChequeAction.CANCEL,
  ChequeAction.MARK_LOST,
  ChequeAction.POSTPONE,
]);
const NEEDS_NEW_DUE_DATE = new Set<string>([ChequeAction.POSTPONE]);
const NEEDS_FEE = new Set<string>([ChequeAction.BOUNCE]);

/** Records a custody movement from the phone. */
export default function PerformActionScreen() {
  const { id, action: preselected } = useLocalSearchParams<{ id: string; action?: string }>();
  const api = useApi();
  const t = useTranslator();
  const { money, online } = useApp();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<string | null>(preselected ?? null);
  const [contactId, setContactId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [fee, setFee] = useState('');
  const [newDueDate, setNewDueDate] = useState('');
  const [error, setError] = useState<string | null>(null);

  const cheque = useQuery<ChequeDetailView>({
    queryKey: ['cheque', id],
    queryFn: () => api.getCheque(id),
    enabled: Boolean(id),
  });
  const contacts = useQuery({
    queryKey: ['contacts', 'picker'],
    queryFn: () => api.listContacts({ pageSize: 100, isActive: true }),
  });
  const locations = useQuery({ queryKey: ['locations'], queryFn: () => api.listLocations() });

  const mutation = useMutation({
    mutationFn: async (action: string) => {
      const version = cheque.data?.version;
      const notes = reason || undefined;

      switch (action) {
        case ChequeAction.RECEIVE:
          return api.receiveCheque(id, {
            fromContactId: contactId ?? '',
            toLocationId: locationId ?? '',
            notes,
            version,
          });
        case ChequeAction.HANDOVER:
          return api.handoverCheque(id, {
            toContactId: contactId ?? '',
            ...(locationId ? { toLocationId: locationId } : {}),
            notes,
            version,
          });
        case ChequeAction.DEPOSIT:
          return api.depositCheque(id, { toLocationId: locationId ?? '', notes, version });
        case ChequeAction.CLEAR:
          return api.clearCheque(id, { notes, version });
        case ChequeAction.BOUNCE:
          return api.bounceCheque(id, {
            reason,
            ...(fee.trim() ? { fee: fee.trim() } : {}),
            version,
          });
        case ChequeAction.RETURN:
          return api.returnCheque(id, {
            reason,
            ...(contactId ? { toContactId: contactId } : {}),
            version,
          });
        case ChequeAction.POSTPONE:
          return api.postponeCheque(id, { newDueDate, reason, version });
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
      void queryClient.invalidateQueries({ queryKey: ['cheques'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      router.back();
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiClientError ? t(caught.messageKey) : t('errors.saveFailed'));
    },
  });

  if (cheque.isPending) return <LoadingView label={t('common.loading')} />;

  const actions = cheque.data?.allowedActions ?? [];

  /** Everything the chosen action requires must be filled before submitting. */
  function missingInput(action: string): boolean {
    if (NEEDS_CONTACT.has(action) && action !== ChequeAction.RETURN && !contactId) return true;
    if (NEEDS_LOCATION.has(action) && action !== ChequeAction.HANDOVER && !locationId) return true;
    if (NEEDS_REASON.has(action) && reason.trim().length === 0) return true;
    if (NEEDS_NEW_DUE_DATE.has(action) && !isValidDate(newDueDate)) return true;
    return false;
  }

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      {!online ? <Banner text={t('common.offline')} /> : null}

      <Picker
        label={t('common.actions')}
        options={actions.map((value) => ({ value, label: t(`action.${value}`) }))}
        value={selected}
        onChange={(next) => {
          setSelected(next);
          setError(null);
        }}
        emptyLabel={t('common.noResults')}
      />

      {selected ? (
        <Section title={t(`action.${selected}`)}>
          {NEEDS_CONTACT.has(selected) ? (
            <Picker
              label={
                selected === ChequeAction.RECEIVE
                  ? t('cheque.originalSource')
                  : t('cheque.currentRecipient')
              }
              required={selected !== ChequeAction.RETURN}
              options={(contacts.data?.data ?? []).map((contact) => ({
                value: contact.id,
                label: contact.name,
              }))}
              value={contactId}
              onChange={setContactId}
              emptyLabel={t('contact.empty')}
            />
          ) : null}

          {NEEDS_LOCATION.has(selected) ? (
            <Picker
              label={t('cheque.currentLocation')}
              required={selected !== ChequeAction.HANDOVER}
              options={(locations.data ?? []).map((location) => ({
                value: location.id,
                label: location.name,
              }))}
              value={locationId}
              onChange={setLocationId}
            />
          ) : null}

          {NEEDS_NEW_DUE_DATE.has(selected) ? (
            <DateField
              label={t('cheque.dueDate')}
              required
              value={newDueDate}
              onChange={setNewDueDate}
              shortcuts={[{ label: t('common.today'), value: todayIso() }]}
            />
          ) : null}

          {NEEDS_FEE.has(selected) ? (
            <Field
              label={t('cheque.bounceFee')}
              value={fee}
              onChangeText={setFee}
              keyboardType="numeric"
              ltr
              hint={
                fee && cheque.data ? money(fee, cheque.data.currency) : t('common.optionalField')
              }
            />
          ) : null}

          <Field
            label={NEEDS_REASON.has(selected) ? t('common.reason') : t('common.notes')}
            required={NEEDS_REASON.has(selected)}
            value={reason}
            onChangeText={setReason}
            multiline
          />

          {error ? <ErrorView label={error} /> : null}

          <Button
            label={t('common.confirm')}
            onPress={() => {
              setError(null);
              mutation.mutate(selected);
            }}
            loading={mutation.isPending}
            disabled={missingInput(selected)}
            large
          />
        </Section>
      ) : (
        <Card>
          <Body muted>
            {actions.length === 0 ? t('common.noResults') : t('cheque.deleteBlocked')}
          </Body>
        </Card>
      )}
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
});
