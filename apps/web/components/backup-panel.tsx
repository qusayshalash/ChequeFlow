'use client';

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { ApiClientError } from '@cheque-flow/api-client';
import { Button, SuccessBanner } from '@cheque-flow/ui';

import { Panel } from '@/components/panel';
import { useApi, useTranslator } from '@/components/providers';

/** Downloads a complete archive of the organization as a JSON file. */
export function BackupPanel() {
  const api = useApi();
  const t = useTranslator();
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const download = useMutation({
    mutationFn: () => api.exportBackup(),
    onSuccess: (json) => {
      const blob = new Blob([json], { type: 'application/json;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `chequeflow-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.append(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
      setDone(true);
    },
    onError: (caught: unknown) =>
      setError(caught instanceof ApiClientError ? t(caught.messageKey) : t('errors.saveFailed')),
  });

  return (
    <Panel title={t('backup.title')}>
      <p className="text-sm text-slate-600">{t('backup.hint')}</p>
      <p className="mt-1 text-sm text-slate-500">{t('backup.excluded')}</p>
      <p className="mt-1 text-sm font-medium text-amber-700">{t('backup.keepSafe')}</p>

      {done ? (
        <div className="mt-3">
          <SuccessBanner message={t('backup.done')} />
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}

      <div className="mt-4">
        <Button
          loading={download.isPending}
          onClick={() => {
            setDone(false);
            setError(null);
            download.mutate();
          }}
        >
          {t('backup.download')}
        </Button>
      </div>
    </Panel>
  );
}
