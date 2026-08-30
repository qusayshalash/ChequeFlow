'use client';

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { ApiClientError } from '@cheque-flow/api-client';
import type { ListChequesQuery } from '@cheque-flow/validation';
import { Button } from '@cheque-flow/ui';

import { useApi, useApp, useTranslator } from '@/components/providers';

/**
 * Downloads the filtered cheque list as CSV.
 *
 * The file is built in the browser from the text the API returns and handed to
 * the user through a temporary object URL, so nothing is written to a server
 * and the download carries the session's own authorisation rather than needing
 * a public link.
 */
export function ExportButton({ query = {} }: { query?: Partial<ListChequesQuery> }) {
  const api = useApi();
  const t = useTranslator();
  const { locale } = useApp();
  const [error, setError] = useState<string | null>(null);

  const download = useMutation({
    mutationFn: () => api.exportChequesCsv(query, locale),
    onSuccess: (csv) => {
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `cheques-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.append(link);
      link.click();
      link.remove();
      // Releasing the URL keeps the blob from being held for the page's life.
      URL.revokeObjectURL(url);
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiClientError ? t(caught.messageKey) : t('errors.saveFailed'));
    },
  });

  return (
    <div className="flex flex-col items-start gap-1">
      <Button
        variant="secondary"
        loading={download.isPending}
        onClick={() => {
          setError(null);
          download.mutate();
        }}
      >
        {t('reports.export')}
      </Button>
      {error ? (
        <p role="alert" className="text-xs text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}
