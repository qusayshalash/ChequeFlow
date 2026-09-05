import type { ReactNode, RefObject } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';

import { STATUS_TONES, TONE_COLORS, colors } from '@cheque-flow/ui/tokens';

import { IconAlert, IconCheck, IconClock } from '@/components/icons';
import { maskDateInput } from '@/lib/dates';
import {
  TAP,
  accent,
  elevation,
  radius,
  sheetElevation,
  space,
  surface,
  text,
  type,
} from '@/theme';

/**
 * The app's interface primitives.
 *
 * Rebuilt against the Swiss-minimal direction in `src/theme.ts`. The rules that
 * shaped every component below:
 *
 *  - **A line, not a shadow.** Cards are separated by a hairline. The only
 *    elevation in the app belongs to the sheet, which genuinely floats.
 *  - **Whitespace groups things.** Labels sit close to their values and far
 *    from the next pair, so the eye finds the structure without boxes inside
 *    boxes.
 *  - **Weight carries hierarchy**, not colour. The accent is spent on exactly
 *    one thing per screen.
 *  - **Every tap target clears 44/48pt**, and every one of them says something
 *    when pressed.
 */

export function Screen({ children }: { children: ReactNode }) {
  return (
    <SafeAreaView style={styles.screen} edges={['top', 'bottom']}>
      {children}
    </SafeAreaView>
  );
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

/**
 * A titled block of related fields or facts.
 *
 * The title sits above the card rather than inside it: an eyebrow costs less
 * vertical space than a header row, and the card stays a single quiet surface.
 */
export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

/**
 * A label and its value.
 *
 * Stacked, not side by side. A long Arabic label and a long value competing for
 * one line is what made the old detail screens ragged; stacking gives each the
 * full width and lets the pair read as one unit.
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
  const busy = disabled || loading;

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: busy, busy: loading }}
      disabled={busy}
      onPress={onPress}
      android_ripple={{
        color: variant === 'secondary' ? surface.sunken : 'rgba(255,255,255,0.18)',
      }}
      style={({ pressed }) => [
        styles.button,
        large && styles.buttonLarge,
        variant === 'primary' && styles.buttonPrimary,
        variant === 'danger' && styles.buttonDanger,
        variant === 'secondary' && styles.buttonSecondary,
        // Colour rather than opacity: a whole control fading out reads as
        // broken, while a darker shade reads as held down.
        pressed && (variant === 'secondary' ? styles.buttonSecondaryDown : styles.buttonDown),
        busy && styles.buttonDisabled,
      ]}
    >
      {loading ? (
        <ActivityIndicator
          size="small"
          color={variant === 'secondary' ? accent.base : text.onBrand}
        />
      ) : (
        <Text
          style={[styles.buttonText, variant === 'secondary' && styles.buttonTextSecondary]}
          numberOfLines={1}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

/**
 * A cheque's status.
 *
 * Carries a shape as well as a colour — the same status must be tellable apart
 * in a screenshot printed in black and white, and by someone who cannot
 * separate the reds from the greens.
 */
export function StatusPill({ status, label }: { status: string; label: string }) {
  const tone = STATUS_TONES[status] ?? 'neutral';
  const palette = TONE_COLORS[tone];

  return (
    <View style={[styles.pill, { backgroundColor: palette.bg }]}>
      <View style={[styles.pillDot, { backgroundColor: palette.fg }]} />
      <Text style={[styles.pillText, { color: palette.fg }]} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

export function Badge({ label, tone = 'danger' }: { label: string; tone?: 'danger' | 'info' }) {
  const palette = TONE_COLORS[tone];
  return (
    <View style={[styles.badge, { backgroundColor: palette.bg }]}>
      {tone === 'danger' ? <IconClock size={13} color={palette.fg} /> : null}
      <Text style={[styles.badgeText, { color: palette.fg }]}>{label}</Text>
    </View>
  );
}

/**
 * Waiting.
 *
 * A skeleton of the shape that is coming, not a spinner: the page does not jump
 * when the content lands, and the wait looks like progress rather than a stall.
 */
export function LoadingView({ label }: { label: string }) {
  return (
    <View style={styles.skeletonWrap} accessibilityRole="progressbar" accessibilityLabel={label}>
      {[0, 1, 2].map((row) => (
        <View key={row} style={styles.skeletonCard}>
          <View style={[styles.skeletonBar, { width: '45%' }]} />
          <View style={[styles.skeletonBar, { width: '75%' }]} />
          <View style={[styles.skeletonBar, { width: '30%' }]} />
        </View>
      ))}
    </View>
  );
}

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
      <View style={styles.emptyMark}>
        <IconCheck size={26} color={accent.base} />
      </View>
      <Text style={styles.emptyTitle}>{label}</Text>
      {hint ? <Text style={styles.emptyHint}>{hint}</Text> : null}
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
    <View style={styles.errorBox} accessibilityRole="alert">
      <View style={styles.errorHead}>
        <IconAlert size={18} color={colors.danger} />
        <Text style={styles.errorText}>{label}</Text>
      </View>
      {onRetry && retryLabel ? (
        <Button label={retryLabel} variant="secondary" onPress={onRetry} />
      ) : null}
    </View>
  );
}

/** A full-width notice, used for the offline banner and inline warnings. */
export function Banner({
  text: message,
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
    <View style={[styles.banner, { backgroundColor: palette.bg, borderColor: palette.fg }]}>
      <IconAlert size={17} color={palette.fg} />
      <Text style={[styles.bannerText, { color: palette.fg }]}>{message}</Text>
      {actionLabel && onAction ? (
        <Pressable
          accessibilityRole="button"
          onPress={onAction}
          hitSlop={10}
          style={styles.bannerAction}
        >
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
  inputRef,
  returnKeyType,
  onSubmitEditing,
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
  /**
   * Given by a screen that chains its fields, so the keyboard's "next" key can
   * hand focus to the one after this. Left out everywhere else.
   */
  inputRef?: RefObject<TextInput | null>;
  returnKeyType?: 'next' | 'done';
  onSubmitEditing?: () => void;
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
        placeholderTextColor={text.faint}
        keyboardType={keyboardType}
        multiline={multiline}
        autoCapitalize={autoCapitalize}
        accessibilityLabel={label}
        ref={inputRef}
        returnKeyType={returnKeyType}
        onSubmitEditing={onSubmitEditing}
        // Focus has somewhere to go, so the keyboard must stay up; letting it
        // close between every field is what makes a twenty-row grid unusable.
        submitBehavior={returnKeyType === 'next' ? 'submit' : undefined}
      />
      {/* The error replaces the hint rather than joining it: two lines of small
          text under a field is where people stop reading either. */}
      {error ? <Text style={styles.errorHint}>{error}</Text> : null}
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
        placeholderTextColor={text.faint}
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
      {error ? <Text style={styles.errorHint}>{error}</Text> : null}
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
      android_ripple={{ color: surface.sunken, borderless: false }}
      style={({ pressed }) => [
        styles.chip,
        selected && styles.chipSelected,
        pressed && !selected && styles.chipDown,
      ]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>{label}</Text>
    </Pressable>
  );
}

export interface Option {
  value: string;
  label: string;
  /**
   * Shown as a badge beside the label.
   *
   * A separate field rather than glued into `label`, so it can be drawn as a
   * badge instead of trailing text. The skill's rule: a badge communicates
   * state, and status must never be carried by colour alone — so the number
   * prints, including zero. "Bounced 0" is an answer; a missing badge is a
   * question.
   */
  count?: number;
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
      {error ? <Text style={styles.errorHint}>{error}</Text> : null}
    </View>
  );
}

/**
 * Horizontal segmented control used for the cheque list tabs.
 *
 * The selected tab is marked by an underline rather than a filled pill: filled
 * pills in a scrolling row read as buttons, and people tap the wrong one.
 */
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
    <View style={styles.tabsTrack}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.tabsRow}
      >
        {options.map((option) => {
          const selected = value === option.value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              // The badge is decorative beside the label, so the whole control
              // says the number once rather than twice.
              accessibilityLabel={
                option.count === undefined ? option.label : `${option.label}: ${option.count}`
              }
              onPress={() => onChange(option.value)}
              style={({ pressed }) => [
                styles.tab,
                selected && styles.tabSelected,
                pressed && !selected && styles.tabPressed,
              ]}
            >
              <Text style={[styles.tabText, selected && styles.tabTextSelected]} numberOfLines={1}>
                {option.label}
              </Text>
              {option.count === undefined ? null : (
                <View style={[styles.tabBadge, selected && styles.tabBadgeSelected]}>
                  <Text
                    style={[styles.tabBadgeText, selected && styles.tabBadgeTextSelected]}
                    importantForAccessibility="no"
                  >
                    {option.count}
                  </Text>
                </View>
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
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
      {/* The scrim is what tells you the sheet is dismissible, so it is dark
          enough to actually read as one. */}
      <Pressable
        style={styles.sheetBackdrop}
        onPress={onClose}
        accessibilityRole="button"
        accessibilityLabel={title}
      />
      <View style={styles.sheet}>
        <View style={styles.sheetHandle} />
        <Text style={styles.sheetTitle}>{title}</Text>
        <ScrollView contentContainerStyle={styles.sheetBody}>{children}</ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  screen: { flex: 1, padding: space['4'], gap: space['4'] },

  section: { gap: space['2'] },
  sectionTitle: { ...type.label, color: text.secondary, textAlign: 'right' },

  card: {
    backgroundColor: surface.card,
    borderRadius: radius.xl,
    padding: space['4'],
    gap: space['3'],
    // Elevation instead of an outline. The hairline is still used inside a
    // card to separate its rows; it is the card-against-page job that the
    // shadow has taken over.
    ...elevation[2],
  },

  heading: { ...type.title, color: text.primary, textAlign: 'right' },
  body: { ...type.body, color: text.primary, textAlign: 'right' },
  muted: { color: text.secondary },
  ltr: { writingDirection: 'ltr', textAlign: 'left' },

  infoRow: { gap: 2, paddingVertical: space['1'] },
  infoLabel: { ...type.caption, color: text.secondary, textAlign: 'right' },
  infoValue: { ...type.bodyStrong, color: text.primary, textAlign: 'right' },

  button: {
    minHeight: TAP,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: 'transparent',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space['5'],
    overflow: 'hidden',
  },
  buttonLarge: { minHeight: 54 },
  buttonPrimary: { backgroundColor: accent.base },
  buttonDanger: { backgroundColor: colors.danger },
  buttonSecondary: { backgroundColor: surface.card, borderColor: surface.lineStrong },
  buttonDown: { backgroundColor: accent.dark },
  buttonSecondaryDown: { backgroundColor: surface.sunken },
  buttonDisabled: { opacity: 0.45 },
  buttonText: { ...type.bodyStrong, color: text.onBrand },
  buttonTextSecondary: { color: text.primary },

  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    borderRadius: radius.pill,
    paddingHorizontal: space['3'],
    paddingVertical: 5,
  },
  pillDot: { width: 6, height: 6, borderRadius: 3 },
  pillText: { ...type.caption },

  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    alignSelf: 'flex-start',
    borderRadius: radius.sm,
    paddingHorizontal: space['2'],
    paddingVertical: 3,
  },
  badgeText: { ...type.caption },

  skeletonWrap: { gap: space['3'] },
  skeletonCard: {
    backgroundColor: surface.card,
    // Matches the real card exactly. A placeholder with a different corner or
    // no shadow makes the screen jump the moment the data lands, which is the
    // one thing a skeleton exists to prevent.
    borderRadius: radius.xl,
    ...elevation[2],
    padding: space['4'],
    gap: space['2'],
  },
  skeletonBar: { height: 12, borderRadius: 6, backgroundColor: surface.sunken },

  centered: { alignItems: 'center', gap: space['3'], paddingVertical: space['10'] },
  emptyMark: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: accent.wash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyTitle: { ...type.heading, color: text.primary, textAlign: 'center' },
  emptyHint: { ...type.callout, color: text.secondary, textAlign: 'center' },

  errorBox: {
    backgroundColor: colors.dangerBg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.danger,
    padding: space['4'],
    gap: space['3'],
  },
  errorHead: { flexDirection: 'row', alignItems: 'center', gap: space['2'] },
  errorText: { ...type.callout, color: colors.danger, flex: 1, textAlign: 'right' },

  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['2'],
    borderRadius: radius.md,
    borderWidth: 1,
    paddingHorizontal: space['3'],
    paddingVertical: space['3'],
  },
  bannerText: { ...type.callout, flex: 1, textAlign: 'right' },
  bannerAction: { minHeight: TAP, justifyContent: 'center', paddingHorizontal: space['2'] },
  bannerActionText: { ...type.label, textDecorationLine: 'underline' },

  field: { gap: space['2'] },
  fieldLabel: { ...type.label, color: text.secondary, textAlign: 'right' },
  requiredMark: { color: colors.danger },
  input: {
    minHeight: TAP,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: surface.lineStrong,
    backgroundColor: surface.card,
    paddingHorizontal: space['3'],
    ...type.body,
    color: text.primary,
    textAlign: 'right',
  },
  inputMultiline: { minHeight: 96, textAlignVertical: 'top', paddingVertical: space['3'] },
  inputError: { borderColor: colors.danger, backgroundColor: colors.dangerBg },
  errorHint: { ...type.caption, color: colors.danger, textAlign: 'right' },
  hintText: { ...type.caption, color: text.secondary, textAlign: 'right' },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space['2'] },
  chip: {
    // TAP, not 38. The skill's floor is 44pt on iOS and 48dp on
    // Android, and `TAP` already holds whichever applies.
    minHeight: TAP,
    justifyContent: 'center',
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: surface.lineStrong,
    backgroundColor: surface.card,
    paddingHorizontal: space['4'],
  },
  chipSelected: { backgroundColor: accent.base, borderColor: accent.base },
  chipDown: { backgroundColor: surface.sunken },
  chipText: { ...type.callout, color: text.primary },
  chipTextSelected: { color: text.onBrand, fontWeight: '600' },

  /**
   * A segmented control, not loose text.
   *
   * These used to be bare words with a 2px underline and nothing behind them,
   * so the strip read as unfinished — the underline had no rule to sit on and
   * the counts were glued to the labels as plain text.
   *
   * Now: a sunken track, and the current option is a raised white pill. That
   * is the same figure-and-ground the rest of the app now uses, and it gives
   * the selection two cues — shape and colour — where colour alone was
   * carrying it.
   */
  tabsTrack: {
    backgroundColor: surface.sunken,
    borderRadius: radius.lg,
    padding: space['1'],
  },
  tabsRow: { gap: space['1'] },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['2'],
    minHeight: TAP - 6,
    paddingHorizontal: space['4'],
    borderRadius: radius.md,
  },
  tabPressed: { backgroundColor: 'rgba(11,31,26,0.05)' },
  tabSelected: {
    backgroundColor: surface.card,
    ...elevation[1],
  },
  tabText: { ...type.callout, fontWeight: '600', color: text.secondary },
  tabTextSelected: { color: text.primary, fontWeight: '700' },
  tabBadge: {
    minWidth: 22,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(11,31,26,0.07)',
    alignItems: 'center',
  },
  tabBadgeSelected: { backgroundColor: accent.wash },
  tabBadgeText: { ...type.caption, fontSize: 11, color: text.secondary },
  tabBadgeTextSelected: { color: accent.dark, fontWeight: '700' },

  sheetBackdrop: { flex: 1, backgroundColor: 'rgba(11,31,26,0.5)' },
  sheet: {
    backgroundColor: surface.card,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: space['4'],
    paddingBottom: space['8'],
    paddingTop: space['2'],
    maxHeight: '80%',
    ...sheetElevation,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: surface.lineStrong,
    marginBottom: space['3'],
  },
  sheetTitle: { ...type.heading, color: text.primary, textAlign: 'right' },
  sheetBody: { gap: space['3'], paddingTop: space['3'] },
});
