import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import { ApiClientError } from '@cheque-flow/api-client';
import { colors, radius, spacing } from '@cheque-flow/ui/tokens';

import { useApi, useTranslator } from '@/components/providers';
import { Body, Button, Card, Heading, Screen } from '@/components/ui';

export default function LoginScreen() {
  const api = useApi();
  const t = useTranslator();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit(): Promise<void> {
    setError(null);
    setPending(true);
    try {
      await api.login(email.trim(), password);
      await queryClient.invalidateQueries({ queryKey: ['session'] });
      router.replace('/(app)');
    } catch (caught) {
      setError(caught instanceof ApiClientError ? t(caught.messageKey) : t('errors.network'));
    } finally {
      setPending(false);
    }
  }

  return (
    <Screen>
      <View style={styles.spacer} />
      <Heading>{t('auth.loginTitle')}</Heading>
      <Body muted>{t('auth.loginSubtitle')}</Body>

      <Card>
        <Text style={styles.label}>{t('auth.username')}</Text>
        <TextInput
          style={styles.input}
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          // A plain keyboard: the field accepts a user name as well as an email.
          keyboardType="default"
          textContentType="username"
          accessibilityLabel={t('auth.usernameHint')}
        />

        <Text style={styles.label}>{t('auth.password')}</Text>
        <TextInput
          style={styles.input}
          value={password}
          onChangeText={setPassword}
          secureTextEntry
          textContentType="password"
          accessibilityLabel={t('auth.password')}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Button
          label={pending ? t('auth.loggingIn') : t('auth.submit')}
          onPress={() => void submit()}
          loading={pending}
          large
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  spacer: { height: spacing.xxl },
  label: { fontSize: 14, color: colors.textMuted, textAlign: 'right' },
  input: {
    minHeight: 52,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    fontSize: 16,
    textAlign: 'left',
    writingDirection: 'ltr',
    color: colors.text,
    backgroundColor: colors.surface,
  },
  error: { color: colors.danger, fontSize: 14, textAlign: 'right' },
});
