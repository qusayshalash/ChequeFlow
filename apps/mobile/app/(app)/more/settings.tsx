import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as LocalAuthentication from 'expo-local-authentication';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, View } from 'react-native';

import { CALENDARS, CALENDAR_LABELS, LOCALES, LOCALE_LABELS } from '@cheque-flow/localization';

import { useApi, useApp, useTranslator } from '@/components/providers';
import { Banner, Body, Button, InfoRow, Picker, Section } from '@/components/ui';
import { clearDrafts, listDrafts, type CaptureDraft } from '@/lib/draft-store';
import { syncDrafts } from '@/lib/draft-sync';
import { accent, radius, space, surface, text, type } from '@/theme';

export default function SettingsScreen() {
  const api = useApi();
  const t = useTranslator();
  const {
    locale,
    calendar,
    setLocale,
    setCalendar,
    biometricLock,
    setBiometricLock,
    online,
    checkConnection,
    date,
    dateTime,
  } = useApp();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [drafts, setDrafts] = useState<CaptureDraft[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncNotice, setSyncNotice] = useState<string | null>(null);

  const session = useQuery({ queryKey: ['session'], queryFn: () => api.me() });

  useEffect(() => {
    void (async () => {
      const hasHardware = await LocalAuthentication.hasHardwareAsync();
      const enrolled = await LocalAuthentication.isEnrolledAsync();
      setBiometricAvailable(hasHardware && enrolled);
      setDrafts(await listDrafts());
    })();
  }, []);

  async function toggleBiometric(): Promise<void> {
    // Turning the lock off asks for the same proof as turning it on. Otherwise
    // anyone holding the unlocked phone could switch it off, which would make
    // the lock decorative.
    const result = await LocalAuthentication.authenticateAsync({
      promptMessage: t('auth.biometricPrompt'),
    });
    if (result.success) setBiometricLock(!biometricLock);
  }

  /**
   * "Sync now" sends anything captured while offline, then refreshes.
   *
   * It is not a reset: nothing local is discarded, which is what the button
   * that used to live here did under a name that did not say so.
   */
  async function syncNow(): Promise<void> {
    setSyncing(true);
    setSyncNotice(null);
    try {
      const reachable = await checkConnection();
      if (!reachable) {
        setSyncNotice(t('common.offline'));
        return;
      }

      // Upload before refetching, so the screens show the cheques that were
      // just sent rather than the state from before them.
      const result = await syncDrafts(api);
      setDrafts(await listDrafts());
      await queryClient.refetchQueries();

      if (result.lost > 0) {
        // Said plainly: those photographs are gone from the device and the
        // cheques were never recorded anywhere. Silence would be worse.
        setSyncNotice(t('errors.draftsLost', { count: result.lost }));
      } else if (result.uploaded > 0) {
        setSyncNotice(t('errors.draftsUploaded', { count: result.uploaded }));
      } else if (result.remaining > 0) {
        setSyncNotice(t('errors.draftsStuck', { count: result.remaining }));
      } else {
        setSyncNotice(t('common.saved'));
      }
    } finally {
      setSyncing(false);
    }
  }

  async function logout(): Promise<void> {
    // Anything still queued belongs to this device, not to the account, and
    // the next person to sign in must not inherit it.
    if (drafts.length > 0) {
      const confirmed = await new Promise<boolean>((resolve) => {
        Alert.alert(t('common.logout'), t('errors.pendingSync', { count: drafts.length }), [
          { text: t('common.cancel'), style: 'cancel', onPress: () => resolve(false) },
          { text: t('common.logout'), style: 'destructive', onPress: () => resolve(true) },
        ]);
      });
      if (!confirmed) return;
    }

    try {
      await api.logout();
    } finally {
      queryClient.clear();
      router.replace('/login');
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      {/* Who is signed in, as an identity rather than three equal lines. */}
      <View style={styles.identity}>
        <View style={styles.avatar}>
          <Text style={styles.initial}>{(session.data?.name ?? '؟').trim().charAt(0)}</Text>
        </View>
        <View style={styles.identityText}>
          <Text style={styles.name}>{session.data?.name ?? ''}</Text>
          <Text style={styles.meta}>{session.data?.email ?? ''}</Text>
          <Text style={styles.meta}>
            {(session.data?.roles ?? []).map((role) => t(`role.${role}`)).join('، ') || '—'}
          </Text>
        </View>
      </View>

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

        {drafts.length > 0 ? (
          <>
            <Body muted>{t('errors.pendingSync', { count: drafts.length })}</Body>
            {/* Every queued capture is listed, so "3 waiting" is never an
                unexplained number the user cannot act on. */}
            {drafts.map((draft) => (
              <InfoRow
                key={draft.id}
                label={dateTime(draft.createdAt)}
                value={draft.lastError ? t(draft.lastError) : t('reminders.upcoming')}
              />
            ))}
          </>
        ) : (
          <Body muted>{t('errors.nothingPending')}</Body>
        )}

        {syncNotice ? <Banner tone="info" text={syncNotice} /> : null}

        <Button label={t('common.syncNow')} onPress={() => void syncNow()} loading={syncing} />

        {drafts.length > 0 ? (
          <Button
            label={t('errors.discardDrafts')}
            variant="danger"
            onPress={() => {
              // Destructive and irreversible — these photographs exist nowhere
              // else — so it is asked as a question, not offered as a tidy-up.
              Alert.alert(
                t('errors.discardDrafts'),
                t('errors.discardDraftsWarning', { count: drafts.length }),
                [
                  { text: t('common.cancel'), style: 'cancel' },
                  {
                    text: t('common.delete'),
                    style: 'destructive',
                    onPress: () => {
                      void clearDrafts().then(() => setDrafts([]));
                    },
                  },
                ],
              );
            }}
          />
        ) : null}
      </Section>

      <Section title={t('auth.biometricEnable')}>
        <Body muted>{t('auth.biometricHint')}</Body>
        <Button
          label={biometricLock ? t('common.yes') : t('common.no')}
          variant="secondary"
          disabled={!biometricAvailable}
          onPress={() => void toggleBiometric()}
        />
        {!biometricAvailable ? <Body muted>{t('auth.biometricUnavailable')}</Body> : null}
      </Section>

      <Button label={t('common.logout')} variant="danger" onPress={() => void logout()} large />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  identity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['3'],
    backgroundColor: surface.card,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: surface.line,
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
  initial: { ...type.heading, color: accent.dark },
  identityText: { flex: 1, gap: 1 },
  name: { ...type.heading, color: text.primary, textAlign: 'right' },
  container: {
    padding: space['4'],
    gap: space['4'],
    backgroundColor: surface.page,
    paddingBottom: space['16'],
  },
  meta: { fontSize: 13, color: text.secondary, textAlign: 'right' },
});
