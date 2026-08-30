'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useState } from 'react';

import { ApiClientError } from '@cheque-flow/api-client';
import { ChequeAction, type ChequeDetailView } from '@cheque-flow/shared-types';
import { Button, Card, Field, inputClassName } from '@cheque-flow/ui';

import { useApi, useTranslator } from '@/components/providers';

/** Actions that need a counterparty or a reason before they can be submitted. */
const NEEDS_CONTACT = new Set<string>([ChequeAction.RECEIVE, ChequeAction.HANDOVER]);
const NEEDS_LOCATION = new Set<string>([ChequeAction.RECEIVE, ChequeAction.DEPOSIT]);
const NEEDS_REASON = new Set<string>([
  ChequeAction.BOUNCE,
  ChequeAction.RETURN,
  ChequeAction.CANCEL,
  ChequeAction.MARK_LOST,
  ChequeAction.POSTPONE,
]);
const NEEDS_DATE = new Set<string>([ChequeAction.POSTPONE]);

/** The bank's charge for returning a cheque, recorded against the cheque. */
const NEEDS_FEE = new Set<string>([ChequeAction.BOUNCE]);

interface Option {
  id: string;
  name: string;
}

export function ChequeActionsPanel({
  cheque,
  contacts,
  locations,
}: {
  cheque: ChequeDetailView;
  contacts: Option[];
  locations: Option[];
}) {
  const api = useApi();
  const t = useTranslator();
  const queryClient = useQueryClient();

  const [action, setAction] = useState<string | null>(null);
  const [contactId, setContactId] = useState('');
  const [locationId, setLocationId] = useState('');
  const [reason, setReason] = useState('');
  const [newDate, setNewDate] = useState('');
  const [fee, setFee] = useState('');
  const [error, setError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: async (selected: string) => {
      const version = cheque.version;
      switch (selected) {
        case ChequeAction.RECEIVE:
          return api.receiveCheque(cheque.id, {
            fromContactId: contactId,
            toLocationId: locationId,
            notes: reason || undefined,
            version,
          });
        case ChequeAction.HANDOVER:
          return api.handoverCheque(cheque.id, {
            toContactId: contactId,
            toLocationId: locationId || undefined,
            notes: reason || undefined,
            version,
          });
        case ChequeAction.DEPOSIT:
          return api.depositCheque(cheque.id, {
            toLocationId: locationId,
            notes: reason || undefined,
            version,
          });
        case ChequeAction.CLEAR:
          return api.clearCheque(cheque.id, { notes: reason || undefined, version });
        case ChequeAction.BOUNCE:
          return api.bounceCheque(cheque.id, {
            reason,
            ...(fee.trim() ? { fee: fee.trim() } : {}),
            version,
          });
        case ChequeAction.RETURN:
          return api.returnCheque(cheque.id, {
            reason,
            toContactId: contactId || undefined,
            version,
          });
        case ChequeAction.POSTPONE:
          return api.postponeCheque(cheque.id, { newDueDate: newDate, reason, version });
        case ChequeAction.CANCEL:
          return api.cancelCheque(cheque.id, { reason, version });
        case ChequeAction.MARK_LOST:
          return api.markChequeLost(cheque.id, { reason, version });
        default:
          throw new Error(`Unsupported action: ${selected}`);
      }
    },
    onSuccess: () => {
      setAction(null);
      setReason('');
      setContactId('');
      setLocationId('');
      void queryClient.invalidateQueries({ queryKey: ['cheque', cheque.id] });
      void queryClient.invalidateQueries({ queryKey: ['cheque-events', cheque.id] });
      void queryClient.invalidateQueries({ queryKey: ['cheques'] });
    },
    onError: (caught: unknown) => {
      setError(
        caught instanceof ApiClientError ? t(caught.messageKey) : t('errors.INTERNAL_ERROR'),
      );
    },
  });

  // The API already filtered these by status *and* by the caller's permissions.
  const available = cheque.allowedActions;

  if (available.length === 0) {
    return null;
  }

  return (
    <Card className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-slate-900">{t('common.actions')}</h2>

      <div className="flex flex-wrap gap-2">
        {available.map((name) => (
          <Button
            key={name}
            variant={action === name ? 'primary' : 'secondary'}
            onClick={() => {
              setAction(action === name ? null : name);
              setError(null);
            }}
          >
            {t(`action.${name}`)}
          </Button>
        ))}
      </div>

      {action ? (
        <form
          className="grid gap-4 border-t border-slate-200 pt-4 sm:grid-cols-2"
          onSubmit={(event) => {
            event.preventDefault();
            setError(null);
            mutation.mutate(action);
          }}
        >
          {NEEDS_CONTACT.has(action) ? (
            <Field label={t('cheque.originalSource')} htmlFor="action-contact" required>
              <select
                id="action-contact"
                required
                className={inputClassName}
                value={contactId}
                onChange={(event) => setContactId(event.target.value)}
              >
                <option value="">{t('common.unknown')}</option>
                {contacts.map((contact) => (
                  <option key={contact.id} value={contact.id}>
                    {contact.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          {NEEDS_LOCATION.has(action) ? (
            <Field label={t('cheque.currentLocation')} htmlFor="action-location" required>
              <select
                id="action-location"
                required
                className={inputClassName}
                value={locationId}
                onChange={(event) => setLocationId(event.target.value)}
              >
                <option value="">{t('common.unknown')}</option>
                {locations.map((location) => (
                  <option key={location.id} value={location.id}>
                    {location.name}
                  </option>
                ))}
              </select>
            </Field>
          ) : null}

          {NEEDS_FEE.has(action) ? (
            <Field
              label={t('cheque.bounceFee')}
              htmlFor="action-fee"
              hint={t('common.optionalField')}
            >
              <input
                id="action-fee"
                dir="ltr"
                inputMode="decimal"
                placeholder="0.00"
                className={inputClassName}
                value={fee}
                onChange={(event) => setFee(event.target.value)}
              />
            </Field>
          ) : null}

          {NEEDS_DATE.has(action) ? (
            <Field label={t('cheque.dueDate')} htmlFor="action-date" required>
              <input
                id="action-date"
                type="date"
                required
                className={inputClassName}
                value={newDate}
                onChange={(event) => setNewDate(event.target.value)}
              />
            </Field>
          ) : null}

          <div className="sm:col-span-2">
            <Field
              label={NEEDS_REASON.has(action) ? t('common.reason') : t('common.notes')}
              htmlFor="action-reason"
              required={NEEDS_REASON.has(action)}
            >
              <input
                id="action-reason"
                required={NEEDS_REASON.has(action)}
                className={inputClassName}
                value={reason}
                onChange={(event) => setReason(event.target.value)}
              />
            </Field>
          </div>

          {error ? (
            <p role="alert" className="sm:col-span-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          <div className="sm:col-span-2">
            <Button type="submit" loading={mutation.isPending}>
              {t('common.confirm')}
            </Button>
          </div>
        </form>
      ) : null}
    </Card>
  );
}
