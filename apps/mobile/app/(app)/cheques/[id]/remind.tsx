import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet } from 'react-native';

import { ApiClientError } from '@cheque-flow/api-client';
import type { ChequeDetailView } from '@cheque-flow/shared-types';

import { useApi, useApp, useTranslator } from '@/components/providers';
import { Body, Button, Chip, DateField, ErrorView, Field, Section } from '@/components/ui';
import { addDaysIso, isValidDate, todayIso } from '@/lib/dates';
import { space } from '@/theme';

/**
 * A reminder the user sets themselves on one cheque.
 *
 * The automatic due-date reminders are recomputed whenever a cheque moves;
 * a reminder set here is marked custom on the server and survives that.
 */
export default function RemindScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const t = useTranslator();
  const { date } = useApp();
  const router = useRouter();
  const queryClient = useQueryClient();

  const cheque = useQuery<ChequeDetailView>({
    queryKey: ['cheque', id],
    queryFn: () => api.getCheque(id),
    enabled: Boolean(id),
  });

  const today = todayIso();
  const [remindOn, setRemindOn] = useState(today);
  const [note, setNote] = useState('');
  const [error, setError] = useState<string | null>(null);

  /** Days before the due date, the offsets people actually ask for. */
  const dueDate = cheque.data?.dueDate;
  const shortcuts = [
    { label: t('common.today'), value: today },
    { label: '+1', value: addDaysIso(today, 1) },
    { label: '+7', value: addDaysIso(today, 7) },
    ...(dueDate
      ? [
          { label: `${t('cheque.dueDate')} -7`, value: addDaysIso(dueDate, -7) },
          { label: `${t('cheque.dueDate')} -3`, value: addDaysIso(dueDate, -3) },
          { label: `${t('cheque.dueDate')} -1`, value: addDaysIso(dueDate, -1) },
        ]
      : []),
  ];

  const mutation = useMutation({
    mutationFn: () =>
      api.createChequeReminder(id, {
        // Reminders fire in the morning, which is when the day's work starts.
        remindAt: `${remindOn}T08:00:00.000Z`,
        ...(note.trim() ? { note: note.trim() } : {}),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['notifications'] });
      router.back();
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiClientError ? t(caught.messageKey) : t('errors.saveFailed'));
    },
  });

  return (
    <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
      <Section title={t('reminders.addCustom')}>
        {dueDate ? (
          <Body muted>
            {t('cheque.dueDate')}: {date(dueDate)}
          </Body>
        ) : null}

        <DateField label={t('common.pickDate')} required value={remindOn} onChange={setRemindOn} />

        <Field label={t('common.notes')} value={note} onChangeText={setNote} multiline />

        {error ? <ErrorView label={error} /> : null}

        <Button
          label={t('common.save')}
          onPress={() => {
            setError(null);
            mutation.mutate();
          }}
          loading={mutation.isPending}
          disabled={!isValidDate(remindOn)}
          large
        />
      </Section>

      <Section title={t('common.pickDate')}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {shortcuts.map((shortcut) => (
            <Chip
              key={shortcut.label}
              label={shortcut.label}
              selected={remindOn === shortcut.value}
              onPress={() => setRemindOn(shortcut.value)}
            />
          ))}
        </ScrollView>
      </Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: space['4'], gap: space['4'], backgroundColor: 'transparent' },
  chips: { gap: space['2'] },
});
