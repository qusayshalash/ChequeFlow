import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as LocalAuthentication from 'expo-local-authentication';
import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text } from 'react-native';

import { LOCALE_LABELS } from '@cheque-flow/localization';
import { colors, spacing } from '@cheque-flow/ui/tokens';

import { useApi, useApp, useTranslator } from '@/components/providers';
import { Body, Button, Card, Heading } from '@/components/ui';
import { clearDrafts, listDrafts } from '@/lib/draft-store';

export default function SettingsScreen() {
  const api = useApi();
  const t = useTranslator();
  const { locale } = useApp();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [biometricAvailable, setBiometricAvailable] = useState(false);
  const [biometricEnabled, setBiometricEnabled] = useState(false);
  const [draftCount, setDraftCount] = useState(0);

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
      <Heading>{t('nav.settings')}</Heading>

      <Card>
        <Body>{session.data?.name ?? ''}</Body>
        <Text style={styles.meta}>{session.data?.email ?? ''}</Text>
        <Text style={styles.meta}>
          {t('nav.roles')}: {(session.data?.roles ?? []).join('، ')}
        </Text>
      </Card>

      <Card>
        <Body>{LOCALE_LABELS[locale]}</Body>
        <Text style={styles.meta}>EXPO_PUBLIC_DEFAULT_LOCALE</Text>
      </Card>

      <Card>
        <Body>{t('auth.biometricEnable')}</Body>
        <Button
          label={biometricEnabled ? t('common.yes') : t('common.no')}
          variant="secondary"
          disabled={!biometricAvailable}
          onPress={() => void toggleBiometric()}
        />
      </Card>

      <Card>
        <Body>
          {t('errors.offline')} ({draftCount})
        </Body>
        <Button
          label={t('common.reset')}
          variant="secondary"
          onPress={() => {
            void clearDrafts().then(() => setDraftCount(0));
          }}
        />
      </Card>

      <Button label={t('common.logout')} variant="danger" onPress={() => void logout()} large />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.md, backgroundColor: colors.surfaceMuted },
  meta: { fontSize: 13, color: colors.textMuted, textAlign: 'right' },
});
