import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';

import { ApiClientError } from '@cheque-flow/api-client';
import { BULK_CHEQUE_ACTIONS } from '@cheque-flow/validation';

import { IconAlert, IconCheck, IconClose } from '@/components/icons';
import * as haptics from '@/lib/haptics';
import { useApi, useTranslator } from '@/components/providers';
import { Banner, Button, Picker, Sheet } from '@/components/ui';
import { useStyles, useTheme } from '@/theme-context';
import { TAP, elevation, motion, radius, space, type, type Palette } from '@/theme';

type BulkAction = (typeof BULK_CHEQUE_ACTIONS)[number];

/** Which actions need somewhere for the cheques to end up. */
const NEEDS_LOCATION: ReadonlySet<BulkAction> = new Set(['RECEIVE', 'DEPOSIT', 'HANDOVER']);
/** …and which need a party on the other side of the move. */
const NEEDS_CONTACT: ReadonlySet<BulkAction> = new Set(['RECEIVE', 'HANDOVER']);

/**
 * Acting on a selection of cheques from the phone.
 *
 * The phone had no selection at all, so confirming a book of twenty cheques
 * meant opening twenty screens. The web has had this for a while; this is the
 * same endpoint and the same rules, in a shape that fits a thumb.
 *
 * `RECEIVE` is the one people are usually looking for and the one they never
 * find, because it is the confirmation step under a different name: it takes
 * a batch from draft to in-hand, which is what makes the cheques count towards
 * a balance and lets them be deposited. The sheet says so rather than assuming
 * anyone will guess.
 */
export function BulkBar({
  selected,
  onClear,
  contacts,
  locations,
}: {
  selected: ReadonlySet<string>;
  onClear: () => void;
  contacts: readonly { id: string; name: string }[];
  locations: readonly { id: string; name: string }[];
}) {
  const c = useTheme();
  const styles = useStyles(makeStyles);
  const api = useApi();
  const t = useTranslator();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<BulkAction>('RECEIVE');
  const [contactId, setContactId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<{ chequeNumber: string; reason: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  // Driven by the selection rather than by mounting: the bar is unmounted at
  // zero, so a value that only animated on mount would jump on every reselect.
  const rise = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const run = Animated.timing(rise, {
      toValue: selected.size > 0 ? 1 : 0,
      duration: selected.size > 0 ? motion.enter : motion.exit,
      useNativeDriver: true,
    });
    run.start();
    return () => run.stop();
  }, [rise, selected.size]);
  const [done, setDone] = useState<string | null>(null);

  const apply = useMutation({
    mutationFn: () =>
      api.bulkChequeAction({
        chequeIds: [...selected],
        action,
        skipInvalid: false,
        ...(NEEDS_CONTACT.has(action) && contactId ? { fromContactId: contactId } : {}),
        ...(action === 'HANDOVER' && contactId ? { toContactId: contactId } : {}),
        ...(NEEDS_LOCATION.has(action) && locationId ? { toLocationId: locationId } : {}),
      }),
    onSuccess: (result) => {
      // The endpoint resolves rather than throwing when the selection is
      // refused, so a blocked result has to be read, not caught.
      if (result.status === 'BLOCKED') {
        // Nothing was written: the selection needs a decision, not a retry.
        haptics.needsAttention();
        setBlocked(
          result.skipped.map((entry) => ({
            chequeNumber: entry.chequeNumber,
            reason: t(entry.reason),
          })),
        );
        return;
      }
      haptics.recorded();
      void queryClient.invalidateQueries({ queryKey: ['cheques'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setDone(t('bulk.confirmBatchDone', { count: String(result.applied.length) }));
      setBlocked([]);
      setOpen(false);
      onClear();
    },
    onError: (caught: unknown) => {
      haptics.refused();
      setError(caught instanceof ApiClientError ? t(caught.messageKey) : t('errors.loadFailed'));
    },
  });

  if (selected.size === 0 && !done) return null;

  return (
    <>
      {done ? (
        <View style={styles.doneWrap}>
          <Banner
            tone="info"
            text={done}
            actionLabel={t('common.close')}
            onAction={() => setDone(null)}
          />
        </View>
      ) : null}

      {selected.size > 0 ? (
        // Rising from the edge it sits on, rather than appearing over the row
        // that was just tapped. Transform and opacity only: the list behind it
        // does not reflow, and a second tap while it is arriving simply
        // retargets the same value.
        <Animated.View
          style={[
            styles.bar,
            {
              opacity: rise,
              transform: [
                { translateY: rise.interpolate({ inputRange: [0, 1], outputRange: [24, 0] }) },
              ],
            },
          ]}
        >
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.clear')}
            onPress={onClear}
            style={styles.clear}
            hitSlop={8}
          >
            <IconClose size={18} color={c.text.secondary} />
          </Pressable>

          <Text style={styles.count}>
            {selected.size} {t('bulk.selected')}
          </Text>

          <Pressable
            accessibilityRole="button"
            onPress={() => {
              setBlocked([]);
              setError(null);
              setOpen(true);
            }}
            style={({ pressed }) => [styles.go, pressed && styles.goDown]}
          >
            <Text style={styles.goText}>{t('bulk.apply')}</Text>
          </Pressable>
        </Animated.View>
      ) : null}

      <Sheet visible={open} title={t('bulk.apply')} onClose={() => setOpen(false)}>
        <Picker
          label={t('common.actions')}
          options={BULK_CHEQUE_ACTIONS.map((value) => ({
            value,
            label: t(`action.${value}`),
          }))}
          value={action}
          onChange={(next) => {
            setAction(next as BulkAction);
            setBlocked([]);
          }}
        />

        {/* Nobody hunting for "confirm" would guess it is called "receive". */}
        {action === 'RECEIVE' ? (
          <View style={styles.hint}>
            <IconCheck size={16} color={c.accent.dark} />
            <Text style={styles.hintText}>{t('bulk.receiveHint')}</Text>
          </View>
        ) : null}

        {NEEDS_CONTACT.has(action) ? (
          <Picker
            label={t('cheque.party')}
            options={contacts.map((entry) => ({ value: entry.id, label: entry.name }))}
            value={contactId}
            onChange={setContactId}
            emptyLabel={t('contact.empty')}
          />
        ) : null}

        {NEEDS_LOCATION.has(action) ? (
          <Picker
            label={t('cheque.currentLocation')}
            options={locations.map((entry) => ({ value: entry.id, label: entry.name }))}
            value={locationId}
            onChange={setLocationId}
            emptyLabel={t('cheque.noLocations')}
          />
        ) : null}

        {/* Nothing was written. Naming the cheques that stopped it is the only
            way to know what to deselect. */}
        {blocked.length > 0 ? (
          <View style={styles.blocked}>
            <View style={styles.blockedHead}>
              <IconAlert size={16} color={c.semantic.danger} />
              <Text style={styles.blockedTitle}>{t('bulk.blocked')}</Text>
            </View>
            {blocked.slice(0, 6).map((entry, index) => (
              <Text key={index} style={styles.blockedRow}>
                {entry.chequeNumber || '—'} · {entry.reason}
              </Text>
            ))}
          </View>
        ) : null}

        {error ? <Banner tone="danger" text={error} /> : null}

        <Button
          label={`${t('bulk.apply')} (${selected.size})`}
          onPress={() => apply.mutate()}
          loading={apply.isPending}
          large
        />
      </Sheet>
    </>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    doneWrap: { position: 'absolute', left: space['4'], right: space['4'], bottom: space['4'] },

    bar: {
      position: 'absolute',
      left: space['4'],
      right: space['4'],
      bottom: space['4'],
      flexDirection: 'row',
      alignItems: 'center',
      gap: space['3'],
      minHeight: TAP + 12,
      paddingHorizontal: space['3'],
      borderRadius: radius.xl,
      backgroundColor: c.surface.card,
      ...elevation[3],
    },
    clear: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },
    count: { ...type.bodyStrong, color: c.text.primary, flex: 1, textAlign: 'right' },
    go: {
      minHeight: TAP,
      justifyContent: 'center',
      paddingHorizontal: space['5'],
      borderRadius: radius.md,
      backgroundColor: c.accent.dark,
    },
    goDown: { opacity: 0.85 },
    goText: { ...type.label, color: c.text.onBrand },

    hint: {
      flexDirection: 'row',
      gap: space['2'],
      backgroundColor: c.accent.wash,
      borderRadius: radius.md,
      padding: space['3'],
    },
    hintText: {
      ...type.caption,
      color: c.accent.dark,
      flex: 1,
      textAlign: 'right',
      lineHeight: 19,
    },

    blocked: {
      gap: space['1'],
      backgroundColor: c.semantic.dangerBg,
      borderRadius: radius.md,
      padding: space['3'],
    },
    blockedHead: { flexDirection: 'row', alignItems: 'center', gap: space['2'] },
    blockedTitle: { ...type.label, color: c.semantic.danger, flex: 1, textAlign: 'right' },
    blockedRow: { ...type.caption, color: c.semantic.danger, textAlign: 'right' },
  });
