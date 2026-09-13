import { useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import {
  Image,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiClientError } from '@cheque-flow/api-client';
import { LOCALES, LOCALE_LABELS } from '@cheque-flow/localization';

import {
  IconAlert,
  IconCheck,
  IconChevronDown,
  IconChevronEnd,
  IconEye,
  IconEyeOff,
  IconLock,
  IconUser,
} from '@/components/icons';
import { useApi, useApp, useTranslator } from '@/components/providers';
// The app's own icon — the same file the phone's home screen shows.
import appIcon from '../assets/icon.png';
import { useStyles, useTheme } from '@/theme-context';
import { TAP, radius, space, type, type Palette } from '@/theme';

/**
 * Signing in.
 *
 * A mint gradient, the app's own icon, and the two fields. Nothing else.
 *
 * It carried a tagline, a welcome line with a second line under it explaining
 * the welcome, a placeholder in each field repeating its label, three
 * reassurance pillars with a title and a hint each, and a copyright notice —
 * a dozen strings to read past on the way to two inputs. None of it helped
 * anybody sign in, and the pillars' claims ("secure and trusted", "fast
 * experience") are the kind of copy that makes a real product look less
 * certain of itself, not more.
 *
 * What is left is what the screen is for: who you are, what you type, and one
 * button. The icon does the introducing.
 *
 * Three things a reference design shows are deliberately absent, because this
 * system has nothing behind them and a dead control on the sign-in screen is
 * worse than a missing one — it is where a locked-out person goes for help:
 *
 *  - **Google and Microsoft sign-in.** The API exposes `login`, `refresh`,
 *    `logout` and `me`, and no OAuth of any kind. Buttons carrying those two
 *    companies' marks would claim an integration that does not exist.
 *  - **"Forgot your password?"** There is no reset endpoint. The link would
 *    take somebody who cannot get in to a place that cannot help them.
 *  - **"Remember me."** The session is written to the device keychain on every
 *    successful sign-in already, so the box would do nothing whichever way it
 *    was left.
 *
 * The language switcher is real: it writes the same setting the settings
 * screen does, and it is on this screen because somebody who cannot read the
 * form cannot reach that screen to change it.
 */
export default function LoginScreen() {
  const c = useTheme();
  const styles = useStyles(makeStyles);
  const api = useApi();
  const t = useTranslator();
  const { locale, setLocale } = useApp();
  const router = useRouter();
  const queryClient = useQueryClient();
  const insets = useSafeAreaInsets();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [revealed, setRevealed] = useState(false);
  const [langOpen, setLangOpen] = useState(false);

  const passwordRef = useRef<TextInput>(null);

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
    <LinearGradient colors={[...c.pageGradient]} locations={[0, 0.45, 1]} style={styles.fill}>
      {/* Two soft washes standing in for the reference's photograph. There is
          no licensed picture of a chequebook in this repository, and a stock
          image is not something to invent — the gradient carries the same
          calm without pretending to be a photograph. */}
      <View pointerEvents="none" style={styles.washTop} />
      <View pointerEvents="none" style={styles.washBottom} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.fill}
      >
        <ScrollView
          contentContainerStyle={[
            styles.content,
            { paddingTop: insets.top + space['3'], paddingBottom: insets.bottom + space['6'] },
          ]}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        >
          {/* Language first, and reachable before anything is read: the
              settings screen is behind the very form this switches. */}
          <View style={styles.langRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('common.language')}
              onPress={() => setLangOpen((open) => !open)}
              style={({ pressed }) => [styles.langPill, pressed && styles.pressed]}
            >
              <IconChevronDown size={15} color={c.text.secondary} />
              <Text style={styles.langText}>{LOCALE_LABELS[locale]}</Text>
              <IconGlobeMark />
            </Pressable>
          </View>

          {langOpen ? (
            <View style={styles.langMenu}>
              {LOCALES.map((value) => (
                <Pressable
                  key={value}
                  accessibilityRole="button"
                  accessibilityState={{ selected: value === locale }}
                  onPress={() => {
                    setLocale(value);
                    setLangOpen(false);
                  }}
                  style={({ pressed }) => [styles.langOption, pressed && styles.pressed]}
                >
                  {value === locale ? <IconCheck size={16} color={c.accent.base} /> : null}
                  <Text style={styles.langOptionText}>{LOCALE_LABELS[value]}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={styles.brand}>
            {/* A glyph in a teal square stood here, which made the sign-in
                screen the one place the product did not look like itself. */}
            <Image
              source={appIcon}
              style={styles.mark}
              accessibilityIgnoresInvertColors
              accessible={false}
            />
            <Text style={styles.wordmark}>{t('common.appName')}</Text>
          </View>

          <View style={styles.card}>
            <Text style={styles.welcome}>{t('auth.welcome')}</Text>

            <View style={styles.fields}>
              <View style={styles.field}>
                <Text style={styles.label}>{t('auth.username')}</Text>
                <View style={[styles.inputRow, error ? styles.inputRowError : null]}>
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    autoCapitalize="none"
                    autoCorrect={false}
                    // A plain keyboard: the field accepts a user name as well
                    // as an email.
                    keyboardType="default"
                    textContentType="username"
                    autoComplete="username"
                    returnKeyType="next"
                    onSubmitEditing={() => passwordRef.current?.focus()}
                    submitBehavior="submit"
                    accessibilityLabel={t('auth.usernameHint')}
                  />
                  <View style={styles.inputIcon}>
                    <IconUser size={19} color={c.accent.dark} />
                  </View>
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.field}>
                <Text style={styles.label}>{t('auth.password')}</Text>
                <View style={[styles.inputRow, error ? styles.inputRowError : null]}>
                  {/* A password nobody can check is a password typed wrong
                      twice. The toggle is a control, so it says what it does. */}
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t(revealed ? 'auth.hidePassword' : 'auth.showPassword')}
                    onPress={() => setRevealed((current) => !current)}
                    style={styles.reveal}
                    hitSlop={8}
                  >
                    {revealed ? (
                      <IconEyeOff size={19} color={c.text.secondary} />
                    ) : (
                      <IconEye size={19} color={c.text.secondary} />
                    )}
                  </Pressable>
                  <TextInput
                    ref={passwordRef}
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    secureTextEntry={!revealed}
                    textContentType="password"
                    autoComplete="current-password"
                    returnKeyType="go"
                    onSubmitEditing={() => void submit()}
                    accessibilityLabel={t('auth.password')}
                  />
                  <View style={styles.inputIcon}>
                    <IconLock size={19} color={c.accent.dark} />
                  </View>
                </View>
              </View>
            </View>

            {error ? (
              <View style={styles.errorBox} accessibilityRole="alert">
                <IconAlert size={17} color={c.semantic.danger} />
                <Text style={styles.error}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('auth.submit')}
              accessibilityState={{ disabled: pending }}
              disabled={pending}
              onPress={() => void submit()}
              style={({ pressed }) => [
                styles.submit,
                pressed && styles.submitDown,
                pending && styles.submitOff,
              ]}
            >
              <IconChevronEnd size={20} color={c.text.onBrand} />
              <Text style={styles.submitText}>
                {pending ? t('common.loading') : t('auth.submit')}
              </Text>
              <View style={styles.submitSpacer} />
            </Pressable>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

/** The globe in the language pill, drawn from two rings rather than an icon. */
function IconGlobeMark() {
  const styles = useStyles(makeStyles);
  return (
    <View style={styles.globe}>
      <View style={styles.globeRing} />
      <View style={styles.globeBar} />
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    fill: { flex: 1 },
    pressed: { opacity: 0.7 },
    content: { paddingHorizontal: space['5'], gap: space['4'] },

    washTop: {
      position: 'absolute',
      top: -140,
      left: -80,
      width: 380,
      height: 380,
      borderRadius: 190,
      backgroundColor: c.surface.card,
      opacity: c.dark ? 0.22 : 0.55,
    },
    washBottom: {
      position: 'absolute',
      bottom: -180,
      right: -110,
      width: 420,
      height: 420,
      borderRadius: 210,
      backgroundColor: c.accent.wash,
      opacity: c.dark ? 0.35 : 0.5,
    },

    langRow: { alignItems: 'flex-start' },
    langPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space['2'],
      minHeight: TAP,
      paddingHorizontal: space['4'],
      borderRadius: radius.pill,
      backgroundColor: c.surface.card,
      borderWidth: 1,
      borderColor: c.surface.line,
    },
    langText: { ...type.label, color: c.text.primary },
    globe: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
    globeRing: {
      position: 'absolute',
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 1.6,
      borderColor: c.text.secondary,
    },
    globeBar: { width: 18, height: 1.6, backgroundColor: c.text.secondary },

    langMenu: {
      alignSelf: 'flex-start',
      marginTop: -space['2'],
      borderRadius: radius.md,
      backgroundColor: c.surface.card,
      borderWidth: 1,
      borderColor: c.surface.line,
      padding: space['1'],
      minWidth: 160,
    },
    langOption: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: space['2'],
      minHeight: TAP,
      paddingHorizontal: space['3'],
      borderRadius: radius.sm,
    },
    langOptionText: { ...type.body, color: c.text.primary },

    brand: { alignItems: 'center', gap: space['2'], marginTop: space['2'] },
    mark: {
      width: 92,
      height: 92,
      // iOS masks an app icon to a squircle; this is the closest a plain corner
      // radius gets, and it keeps the mark reading as the app's own icon.
      borderRadius: 22,
      shadowColor: '#0B1F1A',
      shadowOpacity: 0.18,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 10 },
      elevation: 8,
    },
    wordmark: { ...type.display, color: c.accent.dark, marginTop: space['2'] },

    card: {
      backgroundColor: c.surface.card,
      borderRadius: 28,
      padding: space['5'],
      gap: space['2'],
      shadowColor: '#0B1F1A',
      shadowOpacity: 0.07,
      shadowRadius: 28,
      shadowOffset: { width: 0, height: 12 },
      elevation: 4,
    },
    welcome: {
      ...type.title,
      fontSize: 24,
      color: c.text.primary,
      textAlign: 'center',
      marginBottom: space['2'],
    },

    fields: {
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.surface.line,
      paddingVertical: space['1'],
    },
    field: { paddingHorizontal: space['3'], paddingVertical: space['2'], gap: space['1'] },
    label: { ...type.label, color: c.text.primary, textAlign: 'right' },
    divider: { height: 1, backgroundColor: c.surface.line, marginHorizontal: space['3'] },

    inputRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space['2'],
      minHeight: TAP + 4,
    },
    inputRowError: { borderRadius: radius.md, borderWidth: 1, borderColor: c.semantic.danger },
    inputIcon: {
      width: 42,
      height: 42,
      borderRadius: radius.md,
      backgroundColor: c.accent.wash,
      alignItems: 'center',
      justifyContent: 'center',
    },
    input: {
      flex: 1,
      ...type.body,
      color: c.text.primary,
      textAlign: 'right',
      paddingHorizontal: space['2'],
    },
    reveal: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },

    errorBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space['2'],
      backgroundColor: c.semantic.dangerBg,
      borderRadius: radius.md,
      padding: space['3'],
      marginTop: space['2'],
    },
    error: { ...type.callout, color: c.semantic.danger, flex: 1, textAlign: 'right' },

    submit: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      minHeight: 58,
      borderRadius: radius.lg,
      backgroundColor: c.accent.dark,
      paddingHorizontal: space['5'],
      marginTop: space['4'],
      shadowColor: '#0B1F1A',
      shadowOpacity: 0.18,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 5,
    },
    submitDown: { opacity: 0.85 },
    submitOff: { opacity: 0.6 },
    submitText: { ...type.title, fontSize: 19, color: c.text.onBrand },
    submitSpacer: { width: 20 },
  });
