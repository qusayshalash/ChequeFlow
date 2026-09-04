import { useQueryClient } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ApiClientError } from '@cheque-flow/api-client';
import { LOCALES, LOCALE_LABELS } from '@cheque-flow/localization';
import { colors } from '@cheque-flow/ui/tokens';

import {
  IconAlert,
  IconCheck,
  IconChevronDown,
  IconChevronEnd,
  IconCheque,
  IconClock,
  IconEye,
  IconEyeOff,
  IconLock,
  IconShield,
  IconUser,
} from '@/components/icons';
import { useApi, useApp, useTranslator } from '@/components/providers';
import { TAP, accent, radius, space, surface, text, type } from '@/theme';

/**
 * Signing in.
 *
 * Built to the reference design: a mint gradient behind a floating card, the
 * mark and wordmark above it, and three reassurance pillars beneath.
 *
 * Three things the reference shows are deliberately absent, because this
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
    <LinearGradient
      colors={['#EAF3F0', '#F4F8F7', '#E6F0EC']}
      locations={[0, 0.45, 1]}
      style={styles.fill}
    >
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
              <IconChevronDown size={15} color={text.secondary} />
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
                  {value === locale ? <IconCheck size={16} color={accent.base} /> : null}
                  <Text style={styles.langOptionText}>{LOCALE_LABELS[value]}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <View style={styles.brand}>
            <View style={styles.mark}>
              <IconCheque size={38} color={text.onBrand} />
            </View>
            <Text style={styles.wordmark}>{t('common.appName')}</Text>
            <Text style={styles.tagline}>{t('auth.tagline')}</Text>
            <View style={styles.brandRule} />
          </View>

          <View style={styles.card}>
            <Text style={styles.welcome}>{t('auth.welcome')}</Text>
            <Text style={styles.welcomeHint}>{t('auth.welcomeHint')}</Text>

            <View style={styles.fields}>
              <View style={styles.field}>
                <Text style={styles.label}>{t('auth.username')}</Text>
                <View style={[styles.inputRow, error ? styles.inputRowError : null]}>
                  <TextInput
                    style={styles.input}
                    value={email}
                    onChangeText={setEmail}
                    placeholder={t('auth.usernamePlaceholder')}
                    placeholderTextColor={text.faint}
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
                    <IconUser size={19} color={accent.dark} />
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
                      <IconEyeOff size={19} color={text.secondary} />
                    ) : (
                      <IconEye size={19} color={text.secondary} />
                    )}
                  </Pressable>
                  <TextInput
                    ref={passwordRef}
                    style={styles.input}
                    value={password}
                    onChangeText={setPassword}
                    placeholder={t('auth.passwordPlaceholder')}
                    placeholderTextColor={text.faint}
                    secureTextEntry={!revealed}
                    textContentType="password"
                    autoComplete="current-password"
                    returnKeyType="go"
                    onSubmitEditing={() => void submit()}
                    accessibilityLabel={t('auth.password')}
                  />
                  <View style={styles.inputIcon}>
                    <IconLock size={19} color={accent.dark} />
                  </View>
                </View>
              </View>
            </View>

            {error ? (
              <View style={styles.errorBox} accessibilityRole="alert">
                <IconAlert size={17} color={colors.danger} />
                <Text style={styles.error}>{error}</Text>
              </View>
            ) : null}

            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('auth.loginAction')}
              accessibilityState={{ disabled: pending }}
              disabled={pending}
              onPress={() => void submit()}
              style={({ pressed }) => [
                styles.submit,
                pressed && styles.submitDown,
                pending && styles.submitOff,
              ]}
            >
              <IconChevronEnd size={20} color={text.onBrand} />
              <Text style={styles.submitText}>
                {pending ? t('common.loading') : t('auth.loginAction')}
              </Text>
              <View style={styles.submitSpacer} />
            </Pressable>
          </View>

          {/* Static reassurance, as in the reference. Nothing here claims a
              feature the app does not have. */}
          <View style={styles.pillars}>
            <Pillar
              Icon={IconShield}
              title={t('auth.pillarSecureTitle')}
              hint={t('auth.pillarSecureHint')}
            />
            <View style={styles.pillarRule} />
            <Pillar
              Icon={IconClock}
              title={t('auth.pillarEasyTitle')}
              hint={t('auth.pillarEasyHint')}
            />
            <View style={styles.pillarRule} />
            <Pillar
              Icon={IconCheck}
              title={t('auth.pillarFastTitle')}
              hint={t('auth.pillarFastHint')}
            />
          </View>

          <Text style={styles.rights}>{t('auth.rights')}</Text>
        </ScrollView>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

/** The globe in the language pill, drawn from two rings rather than an icon. */
function IconGlobeMark() {
  return (
    <View style={styles.globe}>
      <View style={styles.globeRing} />
      <View style={styles.globeBar} />
    </View>
  );
}

function Pillar({
  Icon,
  title,
  hint,
}: {
  Icon: (props: { size?: number; color?: string }) => React.ReactElement;
  title: string;
  hint: string;
}) {
  return (
    <View style={styles.pillar}>
      <Icon size={22} color={accent.base} />
      <Text style={styles.pillarTitle} numberOfLines={1}>
        {title}
      </Text>
      <Text style={styles.pillarHint} numberOfLines={1}>
        {hint}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
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
    backgroundColor: '#FFFFFF',
    opacity: 0.55,
  },
  washBottom: {
    position: 'absolute',
    bottom: -180,
    right: -110,
    width: 420,
    height: 420,
    borderRadius: 210,
    backgroundColor: '#D7E9E2',
    opacity: 0.5,
  },

  langRow: { alignItems: 'flex-start' },
  langPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['2'],
    minHeight: TAP,
    paddingHorizontal: space['4'],
    borderRadius: radius.pill,
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: surface.line,
  },
  langText: { ...type.label, color: text.primary },
  globe: { width: 20, height: 20, alignItems: 'center', justifyContent: 'center' },
  globeRing: {
    position: 'absolute',
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1.6,
    borderColor: text.secondary,
  },
  globeBar: { width: 18, height: 1.6, backgroundColor: text.secondary },

  langMenu: {
    alignSelf: 'flex-start',
    marginTop: -space['2'],
    borderRadius: radius.md,
    backgroundColor: surface.card,
    borderWidth: 1,
    borderColor: surface.line,
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
  langOptionText: { ...type.body, color: text.primary },

  brand: { alignItems: 'center', gap: space['2'], marginTop: space['2'] },
  mark: {
    width: 88,
    height: 88,
    borderRadius: 24,
    backgroundColor: accent.dark,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#0B1F1A',
    shadowOpacity: 0.22,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 10 },
    elevation: 8,
  },
  wordmark: { ...type.display, color: accent.dark, marginTop: space['2'] },
  tagline: { ...type.callout, color: text.secondary, textAlign: 'center' },
  brandRule: {
    width: 56,
    height: 3,
    borderRadius: 2,
    backgroundColor: accent.base,
    marginTop: space['1'],
  },

  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 28,
    padding: space['5'],
    gap: space['2'],
    shadowColor: '#0B1F1A',
    shadowOpacity: 0.07,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 12 },
    elevation: 4,
  },
  welcome: { ...type.title, fontSize: 26, color: text.primary, textAlign: 'center' },
  welcomeHint: {
    ...type.callout,
    color: text.secondary,
    textAlign: 'center',
    marginBottom: space['2'],
  },

  fields: {
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: surface.line,
    paddingVertical: space['1'],
  },
  field: { paddingHorizontal: space['3'], paddingVertical: space['2'], gap: space['1'] },
  label: { ...type.label, color: text.primary, textAlign: 'right' },
  divider: { height: 1, backgroundColor: surface.line, marginHorizontal: space['3'] },

  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['2'],
    minHeight: TAP + 4,
  },
  inputRowError: { borderRadius: radius.md, borderWidth: 1, borderColor: colors.danger },
  inputIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: accent.wash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    ...type.body,
    color: text.primary,
    textAlign: 'right',
    paddingHorizontal: space['2'],
  },
  reveal: { width: 34, height: 34, alignItems: 'center', justifyContent: 'center' },

  errorBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['2'],
    backgroundColor: '#FBE2E6',
    borderRadius: radius.md,
    padding: space['3'],
    marginTop: space['2'],
  },
  error: { ...type.callout, color: colors.danger, flex: 1, textAlign: 'right' },

  submit: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 58,
    borderRadius: radius.lg,
    backgroundColor: accent.dark,
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
  submitText: { ...type.title, fontSize: 19, color: text.onBrand },
  submitSpacer: { width: 20 },

  pillars: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginTop: space['2'],
    paddingTop: space['4'],
    borderTopWidth: 1,
    borderTopColor: 'rgba(11,31,26,0.08)',
  },
  pillar: { flex: 1, alignItems: 'center', gap: 3 },
  pillarRule: { width: 1, height: 40, backgroundColor: 'rgba(11,31,26,0.10)' },
  pillarTitle: { ...type.label, color: text.primary, textAlign: 'center' },
  pillarHint: { ...type.caption, fontSize: 11, color: text.secondary, textAlign: 'center' },

  rights: { ...type.caption, color: text.faint, textAlign: 'center', marginTop: space['2'] },
});
