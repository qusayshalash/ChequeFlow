import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as LocalAuthentication from 'expo-local-authentication';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { CALENDARS, CALENDAR_LABELS, LOCALES, LOCALE_LABELS } from '@cheque-flow/localization';
import { colors, spacing } from '@cheque-flow/ui/tokens';

import { useApi, useApp, useTranslator } from '@/components/providers';
import { Banner, Body, Button, Card, InfoRow, Picker, Section } from '@/components/ui';
import { clearDrafts, listDrafts } from '@/lib/draft-store';

export default function SettingsScreen() {
  const api = useApi();
  const t = useTranslator();
  const { locale, calendar, setLocale, setCalendar, online, checkConnection, date } = useApp();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [draftCount, setDraftCount] = useState(0);
  const [syncing, setSyncing] = useState(false);

  const session = useQuery({ queryKey: ['session'], queryFn: () => api.me() });

  useEffect(() => {
    void (async () => {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricAvailable(hasHardware && enrolled);
      setDraftCount((await listDrafts()).length);
    })();
  }, []);

  async function toggleBiometric(): Promise<void> {
    // Enabling asks for a real biometric prompt so the user proves it works
    // before we rely on it at launch.
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: t('auth.biometricPrompt'),
    });
    setBiometricEnabled(result.success);
  }

  /**
   * "Sync now" re-checks the connection and refetches everything on screen.
   * It is not a reset: nothing local is discarded, which is what the old
   * button did and what made it frightening to press.
   */
  async function syncNow(): Promise<void> {
    setSyncing(true);
    try {
      await checkConnection();
      await queryClient.refetchQueries();
    } finally {
      setSyncing(false);
    }
  }

  async function logout(): Promise<void> {
    try {
      await api.logout();
    } finally {
      queryClient.clear();
      router.replace('/login');
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Card>
        <Body>{session.data?.name ?? ''}</Body>
        <Text style={styles.meta}>{session.data?.email ?? ''}</Text>
        <Text style={styles.meta}>
          {t('user.roles')}:{' '}
          {(session.data?.roles ?? []).map((role) => t(`role.${role}`)).join('، ') || '—'}
        </Text>
      </Card>

      <Section title={t('common.language')}>
        <Picker
          label={t('common.language')}
          options={LOCALES.map((value) => ({ value, label: LOCALE_LABELS[value] }))}
          value={locale}
          onChange={(next) => setLocale(next as (typeof LOCALES)[number])}
        />
      </Section>

      <Section title={t('common.calendar')}>
        {/* Presentation only: the stored due date never changes, so switching
            calendars can never alter a cheque. */}
        <Picker
          label={t('common.calendar')}
          options={CALENDARS.map((value) => ({
            value,
            label: CALENDAR_LABELS[value][locale],
          }))}
          value={calendar}
          onChange={(next) => setCalendar(next as (typeof CALENDARS)[number])}
        />
        <InfoRow label={t('common.today')} value={date(new Date().toISOString().slice(0, 10))} />
      </Section>

      <Section title={t('common.syncNow')}>
        <Banner
          tone={online ? 'info' : 'warning'}
          text={online ? t('common.online') : t('common.offline')}
        />
        {draftCount > 0 ? (
          <Body muted>{t('errors.pendingSync', { count: draftCount })}</Body>
        ) : null}
        <Button label={t('common.syncNow')} onPress={() => void syncNow()} loading={syncing} />
        {draftCount > 0 ? (
          <Button
            label={t('common.clear')}
            variant="secondary"
            onPress={() => {
              void clearDrafts().then(() => setDraftCount(0));
            }}
          />
        ) : null}
      </Section>

      <Section title={t('auth.biometricEnable')}>
        <Button
          label={biometricEnabled ? t('common.yes') : t('common.no')}
          variant="secondary"
          disabled={!biometricAvailable}
          onPress={() => void toggleBiometric()}
        />
      </Section>

      <Button label={t('common.logout')} variant="danger" onPress={() => void logout()} large />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: spacing.md,
    gap: spacing.md,
    backgroundColor: colors.surfaceMuted,
    paddingBottom: spacing.xxl,
  },
  meta: { fontSize: 13, color: colors.textMuted, textAlign: 'right' },
});
