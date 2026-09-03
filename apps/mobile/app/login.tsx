import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { ApiClientError } from '@cheque-flow/api-client';
import { colors } from '@cheque-flow/ui/tokens';

import { IconAlert, IconCheque, IconEye, IconEyeOff } from '@/components/icons';
import { useApi, useTranslator } from '@/components/providers';
import { Button, Screen } from '@/components/ui';
import { accent, radius, space, surface, text, type } from '@/theme';

export default function LoginScreen() {
  const api = useApi();
  const t = useTranslator();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [revealed, setRevealed] = useState(false);

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
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.fill}
      >
        <ScrollView
          contentContainerStyle={styles.content}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* The mark carries the brand on the one screen with nothing else on
              it. Everywhere else the app earns its identity by being useful. */}
          <View style={styles.brand}>
            <View style={styles.mark}>
              <IconCheque size={30} color={text.onBrand} />
            </View>
            <Text style={styles.wordmark}>{t('common.appName')}</Text>
          </View>

          <View style={styles.intro}>
            <Text style={styles.title}>{t('auth.loginTitle')}</Text>
            <Text style={styles.subtitle}>{t('auth.loginSubtitle')}</Text>
          </View>

          <View style={styles.form}>
            <View style={styles.field}>
              <Text style={styles.label}>{t('auth.username')}</Text>
              <TextInput
                style={[styles.input, error ? styles.inputError : null]}
                value={email}
                onChangeText={setEmail}
                autoCapitalize="none"
                autoCorrect={false}
                // A plain keyboard: the field accepts a user name as well as an
                // email.
                keyboardType="default"
                textContentType="username"
                autoComplete="username"
                returnKeyType="next"
                accessibilityLabel={t('auth.usernameHint')}
              />
              <Text style={styles.hint}>{t('auth.usernameHint')}</Text>
            </View>

            <View style={styles.field}>
              <Text style={styles.label}>{t('auth.password')}</Text>
              <View style={styles.passwordRow}>
                <TextInput
                  style={[styles.input, styles.passwordInput, error ? styles.inputError : null]}
                  value={password}
                  onChangeText={setPassword}
                  secureTextEntry={!revealed}
                  textContentType="password"
                  autoComplete="current-password"
                  returnKeyType="go"
                  onSubmitEditing={() => void submit()}
                  accessibilityLabel={t('auth.password')}
                />
                {/* A password nobody can check is a password typed wrong twice.
                    The toggle is a control, so it says what it does. */}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t(revealed ? 'auth.hidePassword' : 'auth.showPassword')}
                  onPress={() => setRevealed((current) => !current)}
                  style={styles.reveal}
                  hitSlop={8}
                >
                  {revealed ? (
                    <IconEyeOff size={20} color={text.secondary} />
                  ) : (
                    <IconEye size={20} color={text.secondary} />
                  )}
                </Pressable>
              </View>
            </View>

            {error ? (
              <View style={styles.errorBox} accessibilityRole="alert">
                <IconAlert size={17} color={colors.danger} />
                <Text style={styles.error}>{error}</Text>
              </View>
            ) : null}

            <Button
              label={pending ? t('auth.loggingIn') : t('auth.submit')}
              onPress={() => void submit()}
              loading={pending}
              large
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  content: { flexGrow: 1, justifyContent: 'center', gap: space['8'], paddingVertical: space['8'] },

  brand: { alignItems: 'center', gap: space['3'] },
  mark: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: accent.base,
    alignItems: 'center',
    justifyContent: 'center',
  },
  wordmark: { ...type.heading, color: accent.dark },

  intro: { gap: space['1'] },
  title: { ...type.display, color: text.primary, textAlign: 'center' },
  subtitle: { ...type.callout, color: text.secondary, textAlign: 'center' },

  form: { gap: space['5'] },
  field: { gap: space['2'] },
  label: { ...type.label, color: text.secondary, textAlign: 'right' },
  hint: { ...type.caption, color: text.faint, textAlign: 'right' },
  input: {
    minHeight: 54,
    borderWidth: 1,
    borderColor: surface.lineStrong,
    borderRadius: radius.md,
    paddingHorizontal: space['4'],
    ...type.body,
    textAlign: 'left',
    writingDirection: 'ltr',
    color: text.primary,
    backgroundColor: surface.card,
  },
  inputError: { borderColor: colors.danger, backgroundColor: colors.dangerBg },
  passwordRow: { justifyContent: 'center' },
  passwordInput: { paddingEnd: 52 },
  reveal: {
    position: 'absolute',
    end: space['2'],
    width: 44,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['2'],
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    padding: space['3'],
  },
  error: { ...type.callout, color: colors.danger, flex: 1, textAlign: 'right' },
});
