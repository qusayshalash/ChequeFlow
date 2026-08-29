import * as LocalAuthentication from 'expo-local-authentication';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { AppState, StyleSheet, Text, View } from 'react-native';

import { colors, spacing } from '@cheque-flow/ui/tokens';

import { useApp, useTranslator } from '@/components/providers';
import { Button, LoadingView } from '@/components/ui';

/**
 * Holds the app closed until the device owner proves who they are.
 *
 * Only active when the user has turned the lock on. It re-locks when the app
 * has been in the background, which is the case that matters: a phone handed
 * to someone else, or left on a desk, should not still be showing the
 * company's cheque book.
 *
 * This is a local convenience lock, not an authorization boundary — the API
 * still checks the session token on every request. It stops someone holding
 * the unlocked phone, not someone attacking the server.
 */
export function BiometricGate({ children }: { children: ReactNode }) {
  const { biometricLock } = useApp();
  const t = useTranslator();

  const [unlocked, setUnlocked] = useState(!biometricLock);
  const [checking, setChecking] = useState(false);
  const [failed, setFailed] = useState(false);

  const authenticate = useCallback(async (): Promise<void> => {
    setChecking(true);
    setFailed(false);
    try {
      const result = await LocalAuthentication.authenticateAsync({
        promptMessage: t('auth.biometricPrompt'),
        // The device passcode is a legitimate fallback: refusing it would lock
        // out a user whose sensor is wet, dirty, or simply failing.
        disableDeviceFallback: false,
      });
      setUnlocked(result.success);
      setFailed(!result.success);
    } finally {
      setChecking(false);
    }
  }, [t]);

  useEffect(() => {
    if (!biometricLock) {
      setUnlocked(true);
      return;
    }
    void authenticate();
  }, [biometricLock, authenticate]);

  // Re-lock on return from the background.
  useEffect(() => {
    if (!biometricLock) return;

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') setUnlocked(false);
    });
    return () => subscription.remove();
  }, [biometricLock]);

  if (!biometricLock || unlocked) return <>{children}</>;
  if (checking) return <LoadingView label={t('auth.biometricPrompt')} />;

  return (
    <View style={styles.locked}>
      <Text style={styles.glyph}>🔒</Text>
      <Text style={styles.title}>{t('auth.locked')}</Text>
      {failed ? <Text style={styles.error}>{t('auth.unlockFailed')}</Text> : null}
      <Button label={t('auth.unlock')} onPress={() => void authenticate()} large />
    </View>
  );
}

const styles = StyleSheet.create({
  locked: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    padding: spacing.xl,
    backgroundColor: colors.surfaceMuted,
  },
  glyph: { fontSize: 48 },
  title: { fontSize: 20, fontWeight: '700', color: colors.text, textAlign: 'center' },
  error: { fontSize: 14, color: colors.danger, textAlign: 'center' },
});
