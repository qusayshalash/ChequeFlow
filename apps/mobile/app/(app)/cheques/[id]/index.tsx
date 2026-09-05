import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Image, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ChequeAction, utcToday, type ChequeDetailView } from '@cheque-flow/shared-types';
import { colors } from '@cheque-flow/ui/tokens';

import { IconAlert, IconCalendar } from '@/components/icons';
import { ChequeJourney } from '@/components/journey';
import { useApi, useApp, useTranslator } from '@/components/providers';
import {
  Banner,
  Body,
  Button,
  Card,
  ErrorView,
  InfoRow,
  LoadingView,
  Section,
  StatusPill,
} from '@/components/ui';
import { elevation, radius, space, surface, text, type } from '@/theme';

/**
 * Actions that get their own button on the detail screen.
 *
 * The rest stay behind the full action list. These are the ones a person
 * reaches for while holding the cheque, so they are one tap rather than two.
 */
const PRIMARY_ACTIONS: readonly string[] = [
  ChequeAction.CLEAR,
  ChequeAction.DEPOSIT,
  ChequeAction.RECEIVE,
  ChequeAction.HANDOVER,
];

export default function ChequeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const api = useApi();
  const t = useTranslator();
  const { money, date, dateTime, dueDistance } = useApp();
  const router = useRouter();

  const today = utcToday();

  const query = useQuery<ChequeDetailView>({
    queryKey: ['cheque', id],
    queryFn: () => api.getCheque(id),
    enabled: Boolean(id),
  });

  if (query.isPending) return <LoadingView label={t('common.loading')} />;
  if (query.isError || !query.data) {
    return (
      <ErrorView
        label={t('errors.loadFailed')}
        onRetry={() => void query.refetch()}
        retryLabel={t('common.retry')}
      />
    );
  }

  const cheque = query.data;
  const primary = cheque.allowedActions.filter((action) => PRIMARY_ACTIONS.includes(action));

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
      }
    >
      {/* The amount is the headline; the number and status are its caption.
          The old header led with the cheque number in the heading slot, which
          made every cheque look the same until you read the third line. */}
      <View style={styles.hero}>
        <View style={styles.heroTop}>
          <Text style={styles.heroNumber}>
            {t(`direction.${cheque.direction}`)} · {cheque.chequeNumber}
          </Text>
          <StatusPill status={cheque.status} label={t(`status.${cheque.status}`)} />
        </View>

        <Text style={styles.heroAmount} numberOfLines={1} adjustsFontSizeToFit>
          {money(cheque.amount, cheque.currency)}
        </Text>
        {cheque.amountInWords ? (
          <Text style={styles.heroWords} numberOfLines={2}>
            {cheque.amountInWords}
          </Text>
        ) : null}

        <View style={[styles.dueLine, cheque.isOverdue && styles.dueLineLate]}>
          <IconCalendar size={15} color={cheque.isOverdue ? colors.danger : text.secondary} />
          <Text style={[styles.dueText, cheque.isOverdue && styles.overdueText]}>
            {date(cheque.dueDate)} · {dueDistance(cheque.dueDate, today)}
          </Text>
          {cheque.isOverdue ? (
            <>
              <IconAlert size={15} color={colors.danger} />
              <Text style={styles.overdueText}>{t('cheque.overdue')}</Text>
            </>
          ) : null}
        </View>
      </View>

      {cheque.status === 'BOUNCED' && cheque.bounceReason ? (
        <Banner
          tone="danger"
          text={`${t('cheque.bounceReason')}: ${cheque.bounceReason}${
            cheque.bounceFee ? ` — ${money(cheque.bounceFee, cheque.currency)}` : ''
          }`}
        />
      ) : null}

      {cheque.ocrStatus === 'COMPLETED' ? (
        <Banner
          tone="warning"
          text={t('ocr.suggestionNotice')}
          actionLabel={t('ocr.reviewTitle')}
          onAction={() => router.push(`/(app)/cheques/${cheque.id}/review`)}
        />
      ) : null}

      <ChequeImages chequeId={cheque.id} images={cheque.images} />

      {/* The journey first, because it is the question the record is opened
          for: where did this cheque come from, where is it, where did it go.
          It used to be three rows buried among fifteen. */}
      <ChequeJourney cheque={cheque} />

      {/* Six groups in the web's order, each short enough to read at a glance
          rather than the long stacked lists this screen used to carry —
          "which bank" and "where is it kept" are different questions and were
          eleven rows apart. */}
      <Section title={t('cheque.infoGroup')}>
        <InfoRow label={t('cheque.number')} value={cheque.chequeNumber} ltr />
        <InfoRow label={t('common.amount')} value={money(cheque.amount, cheque.currency)} />
        <InfoRow label={t('cheque.currency')} value={cheque.currency} ltr />
        <InfoRow label={t('cheque.direction')} value={t(`direction.${cheque.direction}`)} />
        <InfoRow label={t('cheque.referenceNumber')} value={cheque.referenceNumber ?? '—'} />
        {cheque.amountInWords ? (
          <InfoRow label={t('cheque.amountInWords')} value={cheque.amountInWords} />
        ) : null}
      </Section>

      <Section title={t('cheque.parties')}>
        <InfoRow label={t('cheque.drawerName')} value={cheque.drawerName ?? '—'} />
        <InfoRow label={t('cheque.originalPayee')} value={cheque.originalPayeeName ?? '—'} />
        <InfoRow label={t('cheque.originalSource')} value={cheque.originalSourceName ?? '—'} />
        <InfoRow label={t('cheque.currentRecipient')} value={cheque.currentRecipientName ?? '—'} />
      </Section>

      <Section title={t('cheque.bankGroup')}>
        <InfoRow label={t('cheque.bank')} value={cheque.bankName ?? '—'} />
        <InfoRow label={t('cheque.bankBranch')} value={cheque.bankBranchRaw ?? '—'} />
        {/* Only ever the masked form: the full account number never leaves the
            server, so it cannot leak from a phone that is lost or shared. */}
        <InfoRow label={t('cheque.accountNumber')} value={cheque.accountNumberMasked ?? '—'} ltr />
      </Section>

      <Section title={t('cheque.dates')}>
        <InfoRow label={t('cheque.dueDate')} value={date(cheque.dueDate)} />
        <InfoRow
          label={t('cheque.issueDate')}
          value={cheque.issueDate ? date(cheque.issueDate) : '—'}
        />
        <InfoRow
          label={t('cheque.receivedDate')}
          value={cheque.receivedDate ? date(cheque.receivedDate) : '—'}
        />
        <InfoRow label={t('common.createdAt')} value={dateTime(cheque.createdAt)} />
        <InfoRow label={t('common.updatedAt')} value={dateTime(cheque.updatedAt)} />
        <InfoRow
          label={t('cheque.reviewedBy')}
          value={cheque.reviewedAt ? dateTime(cheque.reviewedAt) : t('cheque.notYet')}
        />
      </Section>

      <Section title={t('cheque.locationGroup')}>
        <InfoRow label={t('cheque.currentLocation')} value={cheque.currentLocationName ?? '—'} />
        <InfoRow label={t('cheque.branch')} value={cheque.branchName ?? '—'} />
        <InfoRow label={t('cheque.status')} value={t(`status.${cheque.status}`)} />
      </Section>

      {cheque.notes || cheque.purpose ? (
        <Section title={t('cheque.extra')}>
          {cheque.purpose ? <InfoRow label={t('cheque.purpose')} value={cheque.purpose} /> : null}
          {cheque.notes ? <Body>{cheque.notes}</Body> : null}
        </Section>
      ) : null}

      {/* Actions available right now, given the status and the user's role. */}
      {primary.map((action) => (
        <Button
          key={action}
          label={t(`action.${action}`)}
          onPress={() => router.push(`/(app)/cheques/${cheque.id}/action?action=${action}`)}
          large
        />
      ))}

      <Button
        label={t('common.actions')}
        variant="secondary"
        onPress={() => router.push(`/(app)/cheques/${cheque.id}/action`)}
        disabled={cheque.allowedActions.length === 0}
      />
      <Button
        label={t('cheque.timeline')}
        variant="secondary"
        onPress={() => router.push(`/(app)/cheques/${cheque.id}/timeline`)}
      />
      <Button
        label={t('common.edit')}
        variant="secondary"
        onPress={() => router.push(`/(app)/cheques/${cheque.id}/edit`)}
      />
      <Button
        label={t('reminders.addCustom')}
        variant="secondary"
        onPress={() => router.push(`/(app)/cheques/${cheque.id}/remind`)}
      />
    </ScrollView>
  );
}

/**
 * The cheque's own photographs.
 *
 * Images live behind signed, short-lived URLs, so each one is fetched on
 * demand rather than embedded in the cheque payload.
 */
function ChequeImages({
  chequeId,
  images,
}: {
  chequeId: string;
  images: ChequeDetailView['images'];
}) {
  const api = useApi();
  const t = useTranslator();
  const [expanded, setExpanded] = useState<string | null>(null);

  const urls = useQuery({
    queryKey: ['cheque-image-urls', chequeId, images.map((image) => image.id).join(',')],
    enabled: images.length > 0,
    // Signed URLs expire; refetching on focus would be wasteful, so they are
    // simply treated as stale after a few minutes.
    staleTime: 4 * 60_000,
    queryFn: async () => {
      const entries = await Promise.all(
        images.map(async (image) => {
          const result = await api.getChequeImageUrl(chequeId, image.id);
          return [image.id, result.url] as const;
        }),
      );
      return Object.fromEntries(entries);
    },
  });

  if (images.length === 0) {
    return (
      <Card>
        <Body muted>{t('cheque.noImages')}</Body>
      </Card>
    );
  }

  return (
    <Card>
      <Text style={styles.sectionTitle}>{t('cheque.images')}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.imageRow}
      >
        {images.map((image) => {
          const url = urls.data?.[image.id];
          const isExpanded = expanded === image.id;
          return (
            <Pressable
              key={image.id}
              accessibilityRole="imagebutton"
              accessibilityLabel={t(
                image.side === 'FRONT' ? 'cheque.frontImage' : 'cheque.backImage',
              )}
              onPress={() => setExpanded(isExpanded ? null : image.id)}
            >
              {url ? (
                <Image
                  source={{ uri: url }}
                  style={isExpanded ? styles.imageLarge : styles.imageThumb}
                  resizeMode="contain"
                  accessible
                />
              ) : (
                <View style={styles.imageThumb}>
                  <Text style={styles.imagePlaceholder}>
                    {urls.isError ? t('errors.loadFailed') : t('common.loading')}
                  </Text>
                </View>
              )}
              <Text style={styles.imageCaption}>
                {t(image.side === 'FRONT' ? 'cheque.frontImage' : 'cheque.backImage')}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>
    </Card>
  );
}

const styles = StyleSheet.create({
  container: {
    padding: space['4'],
    gap: space['4'],
    backgroundColor: 'transparent',
    paddingBottom: space['16'],
  },

  hero: {
    backgroundColor: surface.card,
    borderRadius: radius.xl,
    ...elevation[2],
    padding: space['5'],
    gap: space['2'],
  },
  heroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space['2'],
  },
  heroNumber: {
    ...type.caption,
    color: text.secondary,
    flexShrink: 1,
    fontVariant: ['tabular-nums'],
  },
  heroAmount: {
    ...type.display,
    fontSize: 36,
    color: text.primary,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  heroWords: { ...type.callout, color: text.secondary, textAlign: 'right' },

  dueLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space['2'],
    flexWrap: 'wrap',
    marginTop: space['1'],
    backgroundColor: surface.sunken,
    borderRadius: radius.sm,
    paddingHorizontal: space['3'],
    paddingVertical: space['2'],
  },
  dueLineLate: { backgroundColor: colors.dangerBg },
  dueText: { ...type.callout, color: text.secondary },
  overdueText: { ...type.label, color: colors.danger },
  sectionTitle: { ...type.label, color: text.secondary, textAlign: 'right' },
  imageRow: { gap: space['2'] },
  imageThumb: {
    width: 180,
    height: 100,
    borderRadius: radius.sm,
    backgroundColor: surface.sunken,
    alignItems: 'center',
    justifyContent: 'center',
  },
  imageLarge: {
    width: 320,
    height: 200,
    borderRadius: radius.sm,
    backgroundColor: surface.sunken,
  },
  imagePlaceholder: { fontSize: 12, color: colors.textMuted },
  imageCaption: { fontSize: 12, color: colors.textMuted, textAlign: 'center', paddingTop: 4 },
});
