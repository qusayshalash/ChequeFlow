'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useEffect, useState } from 'react';

import { ApiClientError, type OcrSuggestionResponse } from '@cheque-flow/api-client';
import type { ChequeDetailView } from '@cheque-flow/shared-types';
import { Badge, Button, Card, Field, LoadingState, inputClassName } from '@cheque-flow/ui';

import { useApi, useTranslator } from '@/components/providers';

/** Extraction fields the reviewer can confirm straight onto the cheque. */
const EDITABLE_FIELDS = [
  { field: 'chequeNumber', target: 'chequeNumber', labelKey: 'cheque.number' },
  { field: 'numericAmount', target: 'amount', labelKey: 'common.amount' },
  { field: 'currency', target: 'currency', labelKey: 'common.currency' },
  { field: 'issueDate', target: 'issueDate', labelKey: 'cheque.issueDate' },
  { field: 'dueDate', target: 'dueDate', labelKey: 'cheque.dueDate' },
  { field: 'drawerName', target: 'drawerName', labelKey: 'cheque.drawerName' },
  { field: 'payeeName', target: 'originalPayeeName', labelKey: 'cheque.originalPayee' },
  { field: 'bankBranch', target: 'bankBranchRaw', labelKey: 'cheque.bankBranch' },
  { field: 'accountNumber', target: 'accountNumber', labelKey: 'cheque.accountNumber' },
] as const;

/**
 * OCR review screen.
 *
 * Nothing here is saved until the user presses confirm: the suggestion is
 * shown as a proposal, with low-confidence fields visibly flagged.
 */
export function OcrReviewPanel({ cheque }: { cheque: ChequeDetailView }) {
  const api = useApi();
  const t = useTranslator();
  const queryClient = useQueryClient();

  const [values, setValues] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);

  const suggestion = useQuery<OcrSuggestionResponse | null>({
    queryKey: ['ocr-suggestion', cheque.id],
    queryFn: () => api.getOcrSuggestion(cheque.id),
  });

  useEffect(() => {
    if (!suggestion.data) return;
    const next: Record<string, string> = {};
    for (const { field } of EDITABLE_FIELDS) {
      const value = suggestion.data.fields[field]?.value;
      // Extracted values are strings or booleans; anything else is ignored so
      // the input never shows "[object Object]".
      next[field] =
        typeof value === 'string' ? value : typeof value === 'boolean' ? String(value) : '';
    }
    setValues(next);
  }, [suggestion.data]);

  const runOcr = useMutation({
    mutationFn: () => api.processOcr(cheque.id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['ocr-suggestion', cheque.id] });
      void queryClient.invalidateQueries({ queryKey: ['cheque', cheque.id] });
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiClientError ? t(caught.messageKey) : t('ocr.failed'));
    },
  });

  const confirm = useMutation({
    mutationFn: () => {
      const confirmed: Record<string, string> = {};
      for (const { field, target } of EDITABLE_FIELDS) {
        const value = values[field]?.trim();
        if (value) confirmed[target] = value;
      }
      return api.reviewCheque(cheque.id, {
        ...(suggestion.data ? { extractionId: suggestion.data.extractionId } : {}),
        confirmed,
        rejectedFields: [],
        version: cheque.version,
      });
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cheque', cheque.id] });
      void queryClient.invalidateQueries({ queryKey: ['cheque-events', cheque.id] });
    },
    onError: (caught: unknown) => {
      setError(
        caught instanceof ApiClientError ? t(caught.messageKey) : t('errors.INTERNAL_ERROR'),
      );
    },
  });

  if (suggestion.isPending) return <LoadingState label={t('ocr.processing')} />;

  if (!suggestion.data) {
    return (
      <Card className="flex flex-col items-start gap-3">
        <h2 className="text-lg font-semibold text-slate-900">{t('ocr.reviewTitle')}</h2>
        <p className="text-sm text-slate-600">{t('ocr.suggestionNotice')}</p>
        <Button onClick={() => runOcr.mutate()} loading={runOcr.isPending}>
          {t('ocr.processing')}
        </Button>
        {error ? (
          <p role="alert" className="text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </Card>
    );
  }

  const lowConfidence = new Set(suggestion.data.lowConfidenceFields);

  return (
    <Card className="flex flex-col gap-4">
      <div>
        <h2 className="text-lg font-semibold text-slate-900">{t('ocr.reviewTitle')}</h2>
        <p className="text-sm text-slate-600">{t('ocr.reviewSubtitle')}</p>
      </div>

      <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
        {t('ocr.suggestionNotice')}
      </p>

      <form
        className="grid gap-4 sm:grid-cols-2"
        onSubmit={(event) => {
          event.preventDefault();
          setError(null);
          confirm.mutate();
        }}
      >
        {EDITABLE_FIELDS.map(({ field, labelKey }) => {
          const extracted = suggestion.data?.fields[field];
          const isLow = lowConfidence.has(field);
          return (
            <Field
              key={field}
              label={t(labelKey)}
              htmlFor={`ocr-${field}`}
              hint={
                extracted
                  ? `${t('ocr.confidence')}: ${Math.round(extracted.confidence * 100)}%`
                  : t('ocr.notExtracted')
              }
            >
              <div className="flex items-center gap-2">
                <input
                  id={`ocr-${field}`}
                  className={inputClassName}
                  dir={field === 'drawerName' || field === 'payeeName' ? 'auto' : 'ltr'}
                  value={values[field] ?? ''}
                  onChange={(event) =>
                    setValues((current) => ({ ...current, [field]: event.target.value }))
                  }
                />
                {isLow ? (
                  <Badge tone="warning" title={t('ocr.lowConfidence')}>
                    !
                  </Badge>
                ) : null}
              </div>
            </Field>
          );
        })}

        {error ? (
          <p role="alert" className="sm:col-span-2 rounded-lg bg-red-50 p-3 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <div className="flex flex-wrap gap-3 sm:col-span-2">
          <Button type="submit" size="lg" loading={confirm.isPending}>
            {t('ocr.confirm')}
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => runOcr.mutate()}
            loading={runOcr.isPending}
          >
            {t('common.retry')}
          </Button>
        </div>
      </form>
    </Card>
  );
}
