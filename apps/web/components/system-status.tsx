'use client';

import { useQuery } from '@tanstack/react-query';

import { Panel } from '@/components/panel';
import { useApi, useTranslator } from '@/components/providers';

const STATE_STYLES = {
  ok: 'bg-teal-50 text-teal-700',
  degraded: 'bg-amber-50 text-amber-700',
  down: 'bg-red-50 text-red-700',
} as const;

/**
 * Whether the moving parts actually work.
 *
 * The failure this exists for is silent: with no credentials the OCR provider
 * falls back to synthetic data, so a cheque comes back with invented values
 * and reads as "the scanner is bad at Arabic". The server says so loudly in
 * its startup log, which nobody running the business will ever see.
 */
export function SystemStatus() {
  const api = useApi();
  const t = useTranslator();

  const query = useQuery({
    queryKey: ['diagnostics'],
    queryFn: () => api.getDiagnostics(),
    refetchInterval: 120_000,
  });

  if (!query.data) return null;

  const rows = [
    { key: 'ocr', label: t('diagnostics.ocr'), status: query.data.ocr },
    { key: 'database', label: t('diagnostics.database'), status: query.data.database },
    { key: 'storage', label: t('diagnostics.storage'), status: query.data.storage },
  ];

  return (
    <Panel title={t('diagnostics.title')}>
      <ul className="flex flex-col gap-3">
        {rows.map((row) => (
          <li key={row.key} className="flex flex-wrap items-center justify-between gap-3">
            <span className="text-sm font-medium text-slate-700">{row.label}</span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-semibold ${STATE_STYLES[row.status.state]}`}
            >
              {t(row.status.messageKey)}
            </span>
          </li>
        ))}
      </ul>

      {query.data.ocr.state !== 'ok' ? (
        <div className="mt-4 rounded-xl border border-amber-100 bg-amber-50 p-4">
          <p className="text-sm font-semibold text-amber-800">{t('diagnostics.howToFix')}</p>
          <p className="mt-1 text-sm text-amber-700">{t('diagnostics.ocrGuide')}</p>
          {/* Names the missing variable, never its value. */}
          {query.data.ocr.detail ? (
            <p className="mt-2 font-mono text-xs text-amber-700" dir="ltr">
              {query.data.ocr.detail}
            </p>
          ) : null}
        </div>
      ) : null}
    </Panel>
  );
}
