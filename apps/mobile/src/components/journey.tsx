import { StyleSheet, Text, View } from 'react-native';

import type { ChequeDetailView } from '@cheque-flow/shared-types';

import { IconCheck } from '@/components/icons';
import { useTranslator } from '@/components/providers';
import { accent, elevation, radius, space, surface, text, type } from '@/theme';

/**
 * Where the cheque came from, where it is, and where it went.
 *
 * This is the question the whole system exists to answer, and in a flat list
 * of fifteen rows it was three entries indistinguishable from the reference
 * number. Here it reads as one path, top to bottom in the order the cheque
 * actually moved.
 *
 * A tick marks a stage that happened; an empty numbered circle marks one that
 * has not. The rule between the markers is what makes them a single path
 * rather than three unrelated rows.
 */
export function ChequeJourney({ cheque }: { cheque: ChequeDetailView }) {
  const t = useTranslator();

  const steps = [
    {
      key: 'from',
      label: t('cheque.receivedFrom'),
      value: cheque.originalSourceName ?? cheque.drawerName,
    },
    {
      key: 'now',
      label: t('cheque.nowAt'),
      // A cheque still with the company sits in a place; one that has left is
      // with a party. Whichever applies is the honest answer to "where is it".
      value: cheque.currentLocationName,
      current: true,
    },
    {
      key: 'to',
      label: t('cheque.handedTo'),
      value: cheque.currentRecipientName,
    },
  ];

  return (
    <View style={styles.card}>
      <Text style={styles.title}>{t('cheque.journey')}</Text>

      {steps.map((step, index) => {
        const done = Boolean(step.value);
        const last = index === steps.length - 1;

        return (
          <View key={step.key} style={styles.step}>
            <View style={styles.rail}>
              <View
                style={[
                  styles.marker,
                  done && styles.markerDone,
                  step.current && done && styles.markerCurrent,
                ]}
              >
                {done ? (
                  <IconCheck size={13} color={text.onBrand} />
                ) : (
                  <Text style={styles.markerNumber}>{index + 1}</Text>
                )}
              </View>
              {!last ? <View style={[styles.line, done && styles.lineDone]} /> : null}
            </View>

            <View style={[styles.body, !last && styles.bodySpaced]}>
              <Text style={[styles.label, step.current && styles.labelCurrent]}>{step.label}</Text>
              <Text style={[styles.value, !done && styles.valueEmpty]} numberOfLines={1}>
                {step.value ?? t('cheque.notYet')}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: surface.card,
    borderRadius: radius.xl,
    ...elevation[2],
    padding: space['4'],
  },
  title: { ...type.heading, color: text.primary, marginBottom: space['3'], textAlign: 'right' },

  step: { flexDirection: 'row', gap: space['3'] },
  rail: { alignItems: 'center' },
  marker: {
    width: 26,
    height: 26,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: surface.lineStrong,
    borderStyle: 'dashed',
    backgroundColor: surface.card,
  },
  markerDone: {
    backgroundColor: accent.base,
    borderColor: accent.base,
    borderStyle: 'solid',
  },
  markerCurrent: { backgroundColor: accent.dark, borderColor: accent.dark },
  markerNumber: { ...type.caption, color: text.faint },
  line: { flex: 1, width: 2, backgroundColor: surface.line, marginVertical: 2 },
  lineDone: { backgroundColor: accent.wash },

  body: { flex: 1, alignItems: 'flex-end' },
  bodySpaced: { paddingBottom: space['4'] },
  label: { ...type.caption, color: text.secondary },
  labelCurrent: { color: accent.dark, fontWeight: '700' },
  value: { ...type.bodyStrong, color: text.primary, textAlign: 'right' },
  valueEmpty: { ...type.body, color: text.faint },
});
