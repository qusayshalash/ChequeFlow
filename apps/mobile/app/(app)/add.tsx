import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, Text } from 'react-native';

import { colors, radius, spacing } from '@cheque-flow/ui/tokens';

import { useTranslator } from '@/components/providers';
import { Body, Heading } from '@/components/ui';

/**
 * The two ways a cheque enters the system.
 *
 * Photographing is listed first because it is the common case, but manual
 * entry is a peer, not a fallback: plenty of cheques are recorded from a
 * statement or over the phone, with no cheque in hand to photograph.
 */
export default function AddScreen() {
  const t = useTranslator();
  const router = useRouter();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Heading>{t('common.add')}</Heading>

      <Choice
        glyph="📷"
        label={t('cheque.captureNew')}
        hint={t('ocr.reviewSubtitle')}
        onPress={() => router.push('/(app)/capture')}
      />
      <Choice
        glyph="✏️"
        label={t('cheque.addManually')}
        hint={t('cheque.newTitle')}
        onPress={() => router.push('/(app)/cheques/new')}
      />
      <Choice
        glyph="👤"
        label={t('contact.newTitle')}
        hint={t('contact.title')}
        onPress={() => router.push('/(app)/contacts/new')}
      />

      <Body muted>{t('cheque.deleteBlocked')}</Body>
    </ScrollView>
  );
}

function Choice({
  glyph,
  label,
  hint,
  onPress,
}: {
  glyph: string;
  label: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      onPress={onPress}
      style={({ pressed }) => [styles.choice, pressed && styles.pressed]}
    >
      <Text style={styles.glyph}>{glyph}</Text>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.hint}>{hint}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.md, backgroundColor: colors.surfaceMuted },
  choice: {
    backgroundColor: colors.surface,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    padding: spacing.lg,
    gap: 6,
    minHeight: 110,
    alignItems: 'center',
  },
  pressed: { opacity: 0.75 },
  glyph: { fontSize: 34 },
  label: { fontSize: 18, fontWeight: '700', color: colors.text, textAlign: 'center' },
  hint: { fontSize: 13, color: colors.textMuted, textAlign: 'center' },
});
