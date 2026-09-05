import { useRouter } from 'expo-router';
import type { ReactElement } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { IconCamera, IconCheque, IconContacts, IconEdit, type IconProps } from '@/components/icons';
import { useTranslator } from '@/components/providers';
import { Body, Heading } from '@/components/ui';
import { accent, elevation, radius, space, surface, text } from '@/theme';

/**
 * The two ways a cheque enters the system.
 *
 * Photographing is listed first because it is the common case, but manual
 * entry is a peer, not a fallback: plenty of cheques are recorded from a
 * statement or over the phone, with no cheque in hand to photograph.
 *
 * The batch entry sits beside them because a customer settling on credit hands
 * over a whole cheque book at once, and doing that one form at a time is the
 * slowest path through the app.
 */
export default function AddScreen() {
  const t = useTranslator();
  const router = useRouter();

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Heading>{t('common.add')}</Heading>

      <Choice
        Icon={IconCamera}
        label={t('cheque.captureNew')}
        hint={t('ocr.reviewSubtitle')}
        onPress={() => router.push('/(app)/capture')}
      />
      <Choice
        Icon={IconEdit}
        label={t('cheque.addManually')}
        hint={t('cheque.newTitle')}
        onPress={() => router.push('/(app)/cheques/new')}
      />
      <Choice
        Icon={IconCheque}
        label={t('cheque.batchMode')}
        hint={t('cheque.batchHint')}
        onPress={() => router.push('/(app)/cheques/batch')}
      />
      <Choice
        Icon={IconContacts}
        label={t('contact.newTitle')}
        hint={t('contact.title')}
        onPress={() => router.push('/(app)/contacts/new')}
      />

      <Body muted>{t('cheque.deleteBlocked')}</Body>
    </ScrollView>
  );
}

function Choice({
  Icon,
  label,
  hint,
  onPress,
}: {
  Icon: (props: IconProps) => ReactElement;
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
      {/* The icon repeats what the label already says, so it is decorative and
          stays out of the screen reader's way. */}
      <View style={styles.glyphWrap}>
        <Icon size={26} color={accent.base} />
      </View>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.hint}>{hint}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: { padding: space['4'], gap: space['4'], backgroundColor: 'transparent' },
  choice: {
    backgroundColor: surface.card,
    borderRadius: radius.xl,
    ...elevation[2],
    padding: space['6'],
    gap: 6,
    minHeight: 110,
    alignItems: 'center',
  },
  // Opacity alone reads as "broken" on a card this large; the brand tint plus
  // a slight lift says "pressed" without moving anything around it.
  pressed: { opacity: 0.9, backgroundColor: accent.wash, borderColor: accent.base },
  glyphWrap: {
    width: 52,
    height: 52,
    borderRadius: radius.md,
    backgroundColor: accent.wash,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { fontSize: 18, fontWeight: '700', color: text.primary, textAlign: 'center' },
  hint: { fontSize: 13, color: text.secondary, textAlign: 'center' },
});
