import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { ApiClientError } from '@cheque-flow/api-client';
import { BULK_CHEQUE_ACTIONS } from '@cheque-flow/validation';

import { IconAlert, IconCheck, IconClose } from '@/components/icons';
import { useApi, useTranslator } from '@/components/providers';
import { Banner, Button, Picker, Sheet } from '@/components/ui';
import { TAP, accent, elevation, radius, space, surface, text, type } from '@/theme';

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
  const api = useApi();
  const t = useTranslator();
  const queryClient = useQueryClient();

  const [open, setOpen] = useState(false);
  const [action, setAction] = useState<BulkAction>('RECEIVE');
  const [contactId, setContactId] = useState<string | null>(null);
  const [locationId, setLocationId] = useState<string | null>(null);
  const [blocked, setBlocked] = useState<{ chequeNumber: string; reason: string }[]>([]);
  const [error, setError] = useState<string | null>(null);
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
        setBlocked(
          result.skipped.map((entry) => ({
            chequeNumber: entry.chequeNumber,
            reason: t(entry.reason),
          })),
        );
        return;
      }
      void queryClient.invalidateQueries({ queryKey: ['cheques'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      setDone(t('bulk.confirmBatchDone', { count: String(result.applied.length) }));
      setBlocked([]);
      setOpen(false);
      onClear();
    },
    onError: (caught: unknown) =>
      setError(caught instanceof ApiClientError ? t(caught.messageKey) : t('errors.loadFailed')),
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
        <View style={styles.bar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.clear')}
            onPress={onClear}
            style={styles.clear}
            hitSlop={8}
          >
            <IconClose size={18} color={text.secondary} />
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
        </View>
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
            <IconCheck size={16} color={accent.dark} />
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
              <IconAlert size={16} color="#C43D42" />
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

const styles = StyleSheet.create({
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
    backgroundColor: surface.card,
    ...elevation[3],
  },
  clear: { width: TAP, height: TAP, alignItems: 'center', justifyContent: 'center' },
  count: { ...type.bodyStrong, color: text.primary, flex: 1, textAlign: 'right' },
  go: {
    minHeight: TAP,
    justifyContent: 'center',
    paddingHorizontal: space['5'],
    borderRadius: radius.md,
    backgroundColor: accent.dark,
  },
  goDown: { opacity: 0.85 },
  goText: { ...type.label, color: text.onBrand },

  hint: {
    flexDirection: 'row',
    gap: space['2'],
    backgroundColor: accent.wash,
    borderRadius: radius.md,
    padding: space['3'],
  },
  hintText: { ...type.caption, color: accent.dark, flex: 1, textAlign: 'right', lineHeight: 19 },

  blocked: {
    gap: space['1'],
    backgroundColor: '#FBE2E6',
    borderRadius: radius.md,
    padding: space['3'],
  },
  blockedHead: { flexDirection: 'row', alignItems: 'center', gap: space['2'] },
  blockedTitle: { ...type.label, color: '#C43D42', flex: 1, textAlign: 'right' },
  blockedRow: { ...type.caption, color: '#C43D42', textAlign: 'right' },
});
