import type { ReactNode } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import {
  MIN_TOUCH_TARGET,
  TONE_COLORS,
  colors,
  radius,
  spacing,
  toneFor,
} from '@cheque-flow/ui/tokens';

/** Native counterparts of the web primitives, sharing the same tokens. */

export function Screen({ children }: { children: ReactNode }) {
  return <View style={styles.screen}>{children}</View>;
}

export function Card({ children }: { children: ReactNode }) {
  return <View style={styles.card}>{children}</View>;
}

export function Heading({ children }: { children: ReactNode }) {
  return <Text style={styles.heading}>{children}</Text>;
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[styles.body, muted === true && styles.muted]}>{children}</Text>;
}

export interface ButtonProps {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
  loading?: boolean;
  large?: boolean;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  large = false,
}: ButtonProps) {
  const background =
    variant === 'primary' ? colors.brand : variant === 'danger' ? colors.danger : colors.surface;
  const textColor = variant === 'secondary' ? colors.text : colors.surface;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || loading, busy: loading }}
      disabled={disabled || loading}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        {
          backgroundColor: background,
          opacity: disabled || loading ? 0.6 : pressed ? 0.85 : 1,
          borderWidth: variant === 'secondary' ? 1 : 0,
          minHeight: large ? 64 : MIN_TOUCH_TARGET,
        },
      ]}
    >
      {loading ? <ActivityIndicator color={textColor} /> : null}
      <Text style={[styles.buttonLabel, { color: textColor, fontSize: large ? 20 : 16 }]}>
        {label}
      </Text>
    </Pressable>
  );
}

export function StatusPill({ status, label }: { status: string; label: string }) {
  const tone = TONE_COLORS[toneFor(status)];
  return (
    <View style={[styles.pill, { backgroundColor: tone.bg }]}>
      <Text style={{ color: tone.fg, fontSize: 13, fontWeight: '600' }}>{label}</Text>
    </View>
  );
}

export function LoadingView({ label }: { label: string }) {
  return (
    <View style={styles.centered}>
      <ActivityIndicator color={colors.brand} size="large" />
      <Text style={styles.body}>{label}</Text>
    </View>
  );
}

export function EmptyView({ label }: { label: string }) {
  return (
    <View style={styles.centered}>
      <Text style={[styles.body, styles.muted]}>{label}</Text>
    </View>
  );
}

export function ErrorView({
  label,
  onRetry,
  retryLabel,
}: {
  label: string;
  onRetry?: () => void;
  retryLabel?: string;
}) {
  return (
    <View style={styles.errorBox}>
      <Text style={{ color: colors.danger, fontSize: 15 }}>{label}</Text>
      {onRetry && retryLabel ? (
        <Button label={retryLabel} variant="secondary" onPress={onRetry} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surfaceMuted, padding: spacing.md, gap: spacing.md },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.md,
    gap: spacing.sm,
  },
  heading: { fontSize: 22, fontWeight: '700', color: colors.text, textAlign: 'right' },
  body: { fontSize: 16, color: colors.text, textAlign: 'right' },
  muted: { color: colors.textMuted },
  button: {
    borderRadius: radius.md,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
  },
  buttonLabel: { fontWeight: '600' },
  pill: {
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
    gap: spacing.sm,
  },
  errorBox: {
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.sm,
  },
});
