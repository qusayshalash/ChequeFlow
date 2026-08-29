import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import {
  MIN_TOUCH_TARGET,
  TONE_COLORS,
  colors,
  radius,
  spacing,
  toneFor,
} from '@cheque-flow/ui/tokens';

import { maskDateInput } from '@/lib/dates';

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

/** A titled block of related fields or facts. */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.card}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

/**
 * One label/value line.
 *
 * Values that are identifiers rather than prose — cheque numbers, account
 * numbers — are rendered left-to-right even in an Arabic layout, because a
 * digit sequence reversed by bidi is a different number.
 */
export function InfoRow({
  label,
  value,
  ltr = false,
}: {
  label: string;
  value: string;
  ltr?: boolean;
}) {
  return (
    <View style={styles.infoRow}>
      <Text style={styles.infoLabel}>{label}</Text>
      <Text style={[styles.infoValue, ltr && styles.ltr]}>{value}</Text>
    </View>
  );
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

/** A small standalone marker, e.g. the overdue flag on a list card. */
export function Badge({ label, tone = 'danger' }: { label: string; tone?: 'danger' | 'info' }) {
  const palette = TONE_COLORS[tone];
  return (
    <View style={[styles.pill, { backgroundColor: palette.bg }]}>
      <Text style={{ color: palette.fg, fontSize: 12, fontWeight: '700' }}>{label}</Text>
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

/**
 * The empty state. Takes an optional action so a screen with nothing on it
 * still tells the user what to do next rather than just stating a fact.
 */
export function EmptyView({
  label,
  hint,
  actionLabel,
  onAction,
}: {
  label: string;
  hint?: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.centered}>
      <Text style={[styles.body, styles.muted]}>{label}</Text>
      {hint ? <Text style={[styles.small, styles.muted]}>{hint}</Text> : null}
      {actionLabel && onAction ? (
        <Button label={actionLabel} variant="secondary" onPress={onAction} />
      ) : null}
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

/** A full-width notice, used for the offline banner and inline warnings. */
export function Banner({
  text,
  tone = 'warning',
  actionLabel,
  onAction,
}: {
  text: string;
  tone?: 'warning' | 'danger' | 'info';
  actionLabel?: string;
  onAction?: () => void;
}) {
  const palette = TONE_COLORS[tone];
  return (
    <View style={[styles.banner, { backgroundColor: palette.bg }]}>
      <Text style={[styles.bannerText, { color: palette.fg }]}>{text}</Text>
      {actionLabel && onAction ? (
        <Pressable accessibilityRole="button" onPress={onAction} style={styles.bannerAction}>
          <Text style={[styles.bannerActionText, { color: palette.fg }]}>{actionLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

/** A labelled text input with inline validation feedback. */
export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  error,
  hint,
  keyboardType = 'default',
  multiline = false,
  ltr = false,
  autoCapitalize = 'sentences',
  required = false,
}: {
  label: string;
  value: string;
  onChangeText: (value: string) => void;
  placeholder?: string;
  error?: string | undefined;
  hint?: string;
  keyboardType?: 'default' | 'numeric' | 'phone-pad' | 'email-address';
  multiline?: boolean;
  ltr?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words';
  required?: boolean;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.requiredMark}> *</Text> : null}
      </Text>
      <TextInput
        style={[
          styles.input,
          multiline && styles.inputMultiline,
          ltr && styles.ltr,
          error ? styles.inputError : null,
        ]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        accessibilityLabel={label}
      />
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {!error && hint ? <Text style={styles.hintText}>{hint}</Text> : null}
    </View>
  );
}

/**
 * A calendar-date input.
 *
 * Masks to `YYYY-MM-DD` as the user types and offers shortcuts, rather than
 * opening a native picker: cheque dates are copied off a printed cheque, which
 * is faster to type than to scroll to.
 */
export function DateField({
  label,
  value,
  onChange,
  error,
  required = false,
  shortcuts = [],
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string | undefined;
  required?: boolean;
  shortcuts?: Array<{ label: string; value: string }>;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.requiredMark}> *</Text> : null}
      </Text>
      <TextInput
        style={[styles.input, styles.ltr, error ? styles.inputError : null]}
        value={value}
        onChangeText={(next) => onChange(maskDateInput(next))}
        placeholder="YYYY-MM-DD"
        placeholderTextColor={colors.textMuted}
        keyboardType="numeric"
        accessibilityLabel={label}
      />
      {shortcuts.length > 0 ? (
        <View style={styles.chipRow}>
          {shortcuts.map((shortcut) => (
            <Chip
              key={shortcut.label}
              label={shortcut.label}
              selected={value === shortcut.value}
              onPress={() => onChange(shortcut.value)}
            />
          ))}
        </View>
      ) : null}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

export function Chip({
  label,
  selected = false,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipSelected]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export interface Option {
  value: string;
  label: string;
}

/** A labelled single-choice picker rendered as chips. */
export function Picker({
  label,
  options,
  value,
  onChange,
  error,
  required = false,
  emptyLabel,
}: {
  label: string;
  options: readonly Option[];
  value: string | null;
  onChange: (value: string) => void;
  error?: string | undefined;
  required?: boolean;
  emptyLabel?: string;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.fieldLabel}>
        {label}
        {required ? <Text style={styles.requiredMark}> *</Text> : null}
      </Text>
      {options.length === 0 && emptyLabel ? (
        <Text style={styles.hintText}>{emptyLabel}</Text>
      ) : (
        <View style={styles.chipRow}>
          {options.map((option) => (
            <Chip
              key={option.value}
              label={option.label}
              selected={value === option.value}
              onPress={() => onChange(option.value)}
            />
          ))}
        </View>
      )}
      {error ? <Text style={styles.errorText}>{error}</Text> : null}
    </View>
  );
}

/** Horizontal segmented control used for the cheque list tabs. */
export function SegmentedTabs({
  options,
  value,
  onChange,
}: {
  options: readonly Option[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.tabsRow}
    >
      {options.map((option) => (
        <Pressable
          key={option.value}
          accessibilityRole="tab"
          accessibilityState={{ selected: value === option.value }}
          onPress={() => onChange(option.value)}
          style={[styles.tab, value === option.value && styles.tabSelected]}
        >
          <Text style={[styles.tabText, value === option.value && styles.tabTextSelected]}>
            {option.label}
          </Text>
        </Pressable>
      ))}
    </ScrollView>
  );
}

/** A bottom sheet, used for filters and confirmations. */
export function Sheet({
  visible,
  title,
  onClose,
  children,
}: {
  visible: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.sheetBackdrop} onPress={onClose} accessibilityRole="button" />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sectionTitle}>{title}</Text>
        <ScrollView contentContainerStyle={styles.sheetBody}>{children}</ScrollView>
      </View>
    </Modal>
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
  sectionTitle: { fontSize: 16, fontWeight: '700', color: colors.text, textAlign: 'right' },
  body: { fontSize: 16, color: colors.text, textAlign: 'right' },
  small: { fontSize: 13, textAlign: 'right' },
  muted: { color: colors.textMuted },
  ltr: { writingDirection: 'ltr', textAlign: 'left' },

  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: spacing.sm,
    paddingVertical: 4,
  },
  infoLabel: { fontSize: 14, color: colors.textMuted, flexShrink: 0 },
  infoValue: { fontSize: 15, color: colors.text, flexShrink: 1, textAlign: 'left' },

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
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  bannerText: { fontSize: 14, flexShrink: 1, textAlign: 'right' },
  bannerAction: { minHeight: 32, justifyContent: 'center', paddingHorizontal: spacing.sm },
  bannerActionText: { fontSize: 14, fontWeight: '700' },

  field: { gap: 6 },
  fieldLabel: { fontSize: 14, color: colors.textMuted, textAlign: 'right' },
  requiredMark: { color: colors.danger },
  input: {
    minHeight: MIN_TOUCH_TARGET,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.sm,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
    color: colors.text,
    textAlign: 'right',
  },
  inputMultiline: { minHeight: 96, textAlignVertical: 'top' },
  inputError: { borderColor: colors.danger },
  errorText: { fontSize: 13, color: colors.danger, textAlign: 'right' },
  hintText: { fontSize: 13, color: colors.textMuted, textAlign: 'right' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.md,
  },
  chipSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  chipText: { fontSize: 14, color: colors.text },
  chipTextSelected: { color: colors.surface, fontWeight: '700' },

  tabsRow: { gap: spacing.sm, paddingVertical: 2 },
  tab: {
    minHeight: 40,
    justifyContent: 'center',
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabSelected: { backgroundColor: colors.brand, borderColor: colors.brand },
  tabText: { fontSize: 14, color: colors.text },
  tabTextSelected: { color: colors.surface, fontWeight: '700' },

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(15, 23, 42, 0.45)' },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.lg,
    borderTopRightRadius: radius.lg,
    padding: spacing.md,
    gap: spacing.sm,
    maxHeight: '80%',
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 44,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.border,
    marginBottom: spacing.sm,
  },
  sheetBody: { gap: spacing.md, paddingBottom: spacing.lg },
});
