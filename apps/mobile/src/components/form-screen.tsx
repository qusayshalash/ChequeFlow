import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui';
import { space, surface } from '@/theme';

/**
 * The frame every form in the app sits in.
 *
 * Three problems it exists to solve, all of which the forms had:
 *
 *  - **The save button was at the bottom of five sections.** On a cheque form
 *    that is two full scrolls away from the field somebody just finished
 *    typing, and a control people have to go looking for is one they stop
 *    using. It is docked here instead, always in reach.
 *  - **The keyboard covered the last field.** `KeyboardAvoidingView` lifts the
 *    content on iOS, where the keyboard overlays rather than resizes.
 *  - **The bar sat on the gesture indicator.** It now carries the bottom safe
 *    inset, and the scroll content reserves the bar's height so the last field
 *    can always be scrolled clear of it.
 */
export function FormScreen({
  children,
  submitLabel,
  onSubmit,
  submitting = false,
  disabled = false,
  secondaryLabel,
  onSecondary,
}: {
  children: ReactNode;
  submitLabel: string;
  onSubmit: () => void;
  submitting?: boolean;
  disabled?: boolean;
  secondaryLabel?: string;
  onSecondary?: () => void;
}) {
  const insets = useSafeAreaInsets();

  return (
    <KeyboardAvoidingView
      style={styles.fill}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <ScrollView
        style={styles.fill}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
      >
        {children}
      </ScrollView>

      <View style={[styles.bar, { paddingBottom: insets.bottom + space['3'] }]}>
        {secondaryLabel && onSecondary ? (
          <View style={styles.secondary}>
            <Button label={secondaryLabel} variant="secondary" onPress={onSecondary} />
          </View>
        ) : null}
        <View style={styles.primary}>
          <Button
            label={submitLabel}
            onPress={onSubmit}
            loading={submitting}
            disabled={disabled}
            large
          />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, backgroundColor: surface.page },
  content: {
    padding: space['4'],
    gap: space['4'],
    // Room for the docked bar, so the last field is never trapped under it.
    paddingBottom: space['16'],
  },
  bar: {
    flexDirection: 'row',
    gap: space['3'],
    paddingHorizontal: space['4'],
    paddingTop: space['3'],
    backgroundColor: surface.card,
    borderTopWidth: 1,
    borderTopColor: surface.line,
  },
  secondary: { flex: 1 },
  primary: { flex: 2 },
});
