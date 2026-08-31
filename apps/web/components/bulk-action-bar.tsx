'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ApiClientError, type BulkActionSkip } from '@cheque-flow/api-client';
import { BULK_CHEQUE_ACTIONS, type BulkChequeActionInput } from '@cheque-flow/validation';
import { Button, inputClassName } from '@cheque-flow/ui';

import { useApi, useTranslator } from '@/components/providers';

type BulkAction = (typeof BULK_CHEQUE_ACTIONS)[number];

/** Actions that move a cheque somewhere, and so need a destination. */
const NEEDS_LOCATION: ReadonlySet<BulkAction> = new Set(['RECEIVE', 'DEPOSIT', 'HANDOVER']);
/** Actions that name the other party. */
const NEEDS_CONTACT: ReadonlySet<BulkAction> = new Set(['HANDOVER']);
/** Actions that move the due date. */
const NEEDS_DATE: ReadonlySet<BulkAction> = new Set(['POSTPONE']);

/**
 * Applies one action to the cheques the user has ticked.
 *
 * Appears only when something is selected, and docks to the bottom of the
 * screen: the selection is made at the top of a long table, and an action bar
 * you have to scroll back up to find is one people stop using.
 */
export function BulkActionBar({
  selected,
  onClear,
}: {
  selected: ReadonlySet<string>;
  onClear: () => void;
}) {
  const api = useApi();
  const t = useTranslator();
  const queryClient = useQueryClient();

  const [action, setAction] = useState<BulkAction>('DEPOSIT');
  const [locationId, setLocationId] = useState('');
  const [contactId, setContactId] = useState('');
  const [effectiveDate, setEffectiveDate] = useState('');
  const [notes, setNotes] = useState('');

  const [blocked, setBlocked] = useState<BulkActionSkip[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<number | null>(null);

  const locations = useQuery({ queryKey: ['locations'], queryFn: () => api.listLocations() });
  const contacts = useQuery({
    queryKey: ['contacts', 'all'],
    queryFn: () => api.listContacts({ pageSize: 100 }),
  });

  const mutation = useMutation({
    mutationFn: (skipInvalid: boolean) => {
      const input = {
        chequeIds: [...selected],
        action,
        skipInvalid,
        ...(NEEDS_LOCATION.has(action) && locationId ? { toLocationId: locationId } : {}),
        ...(NEEDS_CONTACT.has(action) && contactId ? { toContactId: contactId } : {}),
        ...(action === 'RECEIVE' && contactId ? { fromContactId: contactId } : {}),
        ...(NEEDS_DATE.has(action) && effectiveDate ? { effectiveDate } : {}),
        ...(notes ? { notes } : {}),
      } as BulkChequeActionInput;

      return api.bulkChequeAction(input);
    },
    onSuccess: (result) => {
      // A refusal arrives as a normal response, not an error: the server has
      // written nothing and is naming the cheques that stopped it.
      if (result.status === 'BLOCKED') {
        setBlocked(result.skipped);
        setDone(null);
        return;
      }

      setBlocked([]);
      setDone(result.applied.length);
      void queryClient.invalidateQueries({ queryKey: ['cheques'] });
      void queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      onClear();
    },
    onError: (caught: unknown) => {
      setError(
        caught instanceof ApiClientError ? t(caught.messageKey) : t('errors.INTERNAL_ERROR'),
      );
    },
  });

  if (selected.size === 0) {
    return done !== null ? (
      <div
        role="status"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-teal-200 bg-teal-50 p-3 text-center text-sm text-teal-900"
      >
        {t('bulk.applied')}: {done}
      </div>
    ) : null;
  }

  function run(skipInvalid: boolean): void {
    setError(null);
    setDone(null);
    mutation.mutate(skipInvalid);
  }

  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
      <div className="mx-auto flex max-w-[1180px] flex-wrap items-center gap-3">
        <span className="text-sm font-semibold text-slate-900">
          {t('bulk.selected')}: <span className="tabular-nums">{selected.size}</span>
        </span>

        <select
          aria-label={t('common.actions')}
          className={`${inputClassName} w-44`}
          value={action}
          onChange={(event) => {
            setAction(event.target.value as BulkAction);
            setBlocked([]);
          }}
        >
          {BULK_CHEQUE_ACTIONS.map((value) => (
            <option key={value} value={value}>
              {t(`action.${value}`)}
            </option>
          ))}
        </select>

        {NEEDS_LOCATION.has(action) ? (
          <select
            aria-label={t('cheque.currentLocation')}
            className={`${inputClassName} w-44`}
            value={locationId}
            onChange={(event) => setLocationId(event.target.value)}
          >
            <option value="">{t('cheque.currentLocation')}</option>
            {(locations.data ?? []).map((location) => (
              <option key={location.id} value={location.id}>
                {location.name}
              </option>
            ))}
          </select>
        ) : null}

        {NEEDS_CONTACT.has(action) || action === 'RECEIVE' ? (
          <select
            aria-label={t('cheque.party')}
            className={`${inputClassName} w-44`}
            value={contactId}
            onChange={(event) => setContactId(event.target.value)}
          >
            <option value="">{t('cheque.party')}</option>
            {(contacts.data?.data ?? []).map((contact) => (
              <option key={contact.id} value={contact.id}>
                {contact.name}
              </option>
            ))}
          </select>
        ) : null}

        {NEEDS_DATE.has(action) ? (
          <input
            type="date"
            aria-label={t('cheque.dueDate')}
            className={`${inputClassName} w-44`}
            value={effectiveDate}
            onChange={(event) => setEffectiveDate(event.target.value)}
          />
        ) : null}

        <input
          aria-label={t('common.notes')}
          placeholder={t('common.notes')}
          className={`${inputClassName} w-48`}
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
        />

        <div className="ms-auto flex gap-2">
          <Button variant="secondary" onClick={onClear}>
            {t('common.cancel')}
          </Button>
          <Button onClick={() => run(false)} loading={mutation.isPending}>
            {t('bulk.apply')}
          </Button>
        </div>

        {blocked.length > 0 ? (
          <div
            role="alert"
            className="w-full rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900"
          >
            <p className="font-semibold">{t('bulk.blocked')}</p>
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
              {blocked.map((entry) => (
                <li key={entry.chequeId} dir="auto">
                  <span className="font-semibold tabular-nums">{entry.chequeNumber || '—'}</span>{' '}
                  {t(entry.reason)}
                </li>
              ))}
            </ul>
            <div className="mt-2">
              {/* The override is a separate, deliberate click — never the
                  button the user already pressed. */}
              <Button variant="danger" onClick={() => run(true)} loading={mutation.isPending}>
                {t('bulk.applyRest')}
              </Button>
            </div>
          </div>
        ) : null}

        {error ? (
          <p role="alert" className="w-full text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
