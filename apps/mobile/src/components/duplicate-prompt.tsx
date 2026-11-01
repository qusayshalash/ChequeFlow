import { StyleSheet, Text, View } from 'react-native';

import type { DuplicateChequeMatch } from '@cheque-flow/shared-types';

import { useApp, useTranslator } from '@/components/providers';
import { Button } from '@/components/ui';
import { fontFamily, space, type Palette } from '@/theme';
import { useStyles } from '@/theme-context';

/**
 * The question the API asks when a cheque matches one already on file.
 *
 * Not an error: a re-issued cheque can legitimately repeat a number, and only
 * the person holding it knows which this is. So the matches are named — a
 * warning that will not say which cheque it means asks the reader to decide
 * blind — and the answer is theirs: keep both, or go back and look.
 *
 * Shared by creating and editing a cheque, which ask the same question for the
 * same reason and used to differ only in that one of them never asked.
 */
export function DuplicatePrompt({
  matches,
  currency,
  onConfirm,
  onCancel,
}: {
  matches: readonly DuplicateChequeMatch[];
  currency: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const t = useTranslator();
  const { money } = useApp();
  const styles = useStyles(makeStyles);

  return (
    <View style={styles.box} accessibilityRole="alert">
      <Text style={styles.title}>{t('cheque.duplicateWarning')}</Text>
      {matches.map((match) => (
        <Text key={match.chequeId} style={styles.row}>
          {match.chequeNumber} — {money(match.amount, currency)} — {t(`status.${match.status}`)}
        </Text>
      ))}
      <Button label={t('common.confirm')} variant="danger" onPress={onConfirm} />
      <Button label={t('common.cancel')} variant="secondary" onPress={onCancel} />
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    box: {
      backgroundColor: c.semantic.warningBg,
      borderRadius: 10,
      padding: space['4'],
      gap: space['2'],
    },
    title: {
      fontFamily: fontFamily.bold,
      fontSize: 15,
      color: c.semantic.warning,
      textAlign: 'right',
    },
    row: {
      fontFamily: fontFamily.regular,
      fontSize: 14,
      color: c.semantic.warning,
      textAlign: 'right',
    },
  });
