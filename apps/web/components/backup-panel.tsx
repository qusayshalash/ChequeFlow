'use client';

import { useMutation } from '@tanstack/react-query';
import { useState } from 'react';

import { ApiClientError, type RestoreBackupResponse } from '@cheque-flow/api-client';
import { Button, SuccessBanner, inputClassName } from '@cheque-flow/ui';

import { Panel } from '@/components/panel';
import { useApi, useTranslator } from '@/components/providers';
import {
  DriveError,
  backupFileName,
  driveClientId,
  requestDriveToken,
  uploadToDrive,
} from '@/lib/google-drive';

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
      link.download = backupFileName();
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

      <div className="mt-4 flex flex-wrap items-center gap-3">
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
        <DriveButton
          onBusy={() => {
            setDone(false);
            setError(null);
          }}
        />
      </div>

      <RestoreSection />
    </Panel>
  );
}

/**
 * Reads an archive back in.
 *
 * Deliberately more awkward than the download beside it: the file has to be
 * chosen, the word typed, and only then does the button work. A restore cannot
 * be undone, and the append-only ledger means there is no second chance to
 * clear a wrong one out.
 */
/**
 * A second home for the archive, one click away.
 *
 * The upload runs in this page with the reader's own Google account: the
 * server never holds a Google token, so there is no long-lived credential to
 * protect or to leak. Shown only where an OAuth client is configured — a
 * button that cannot work is worse than no button.
 */
function DriveButton({ onBusy }: { onBusy: () => void }) {
  const api = useApi();
  const t = useTranslator();
  const [uploaded, setUploaded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const clientId = driveClientId();

  const upload = useMutation({
    mutationFn: async () => {
      // The consent window must open from the click, so the token is asked for
      // before the export rather than after it.
      const token = await requestDriveToken(clientId!);
      const json = await api.exportBackup();
      return uploadToDrive(token, json, backupFileName());
    },
    onSuccess: (file) => setUploaded(file.name),
    onError: (caught: unknown) => {
      // Closing the consent window is an answer, not a failure.
      if (caught instanceof DriveError && caught.reason === 'cancelled') return;
      if (caught instanceof DriveError) {
        setError(t(caught.reason === 'denied' ? 'backup.driveDenied' : 'backup.driveFailed'));
        return;
      }
      setError(caught instanceof ApiClientError ? t(caught.messageKey) : t('backup.driveFailed'));
    },
  });

  if (!clientId) return null;

  return (
    <>
      <Button
        variant="secondary"
        loading={upload.isPending}
        onClick={() => {
          onBusy();
          setUploaded(null);
          setError(null);
          upload.mutate();
        }}
      >
        {t('backup.drive')}
      </Button>

      <p className="basis-full text-sm text-slate-500">{t('backup.driveHint')}</p>

      {uploaded ? (
        <div className="basis-full">
          <SuccessBanner message={t('backup.driveDone', { name: uploaded })} />
        </div>
      ) : null}
      {error ? (
        <p role="alert" className="basis-full text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </>
  );
}

function RestoreSection() {
  const api = useApi();
  const t = useTranslator();

  const [file, setFile] = useState<File | null>(null);
  const [word, setWord] = useState('');
  const [result, setResult] = useState<RestoreBackupResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const restore = useMutation({
    mutationFn: async () => {
      if (!file) throw new Error('no-file');

      let archive: unknown;
      try {
        archive = JSON.parse(await file.text());
      } catch {
        throw new Error('bad-file');
      }

      return api.restoreBackup({ archive, confirm: true } as never);
    },
    onSuccess: (response) => {
      setResult(response);
      setError(null);
    },
    onError: (caught: unknown) => {
      setResult(null);
      if (caught instanceof Error && caught.message === 'bad-file') {
        setError(t('backup.restoreBadFile'));
        return;
      }
      if (caught instanceof ApiClientError) {
        // The server says the organization is not empty; the generic conflict
        // message would leave the user with nothing to act on.
        setError(caught.code === 'CONFLICT' ? t('backup.restoreNotEmpty') : t(caught.messageKey));
        return;
      }
      setError(t('errors.saveFailed'));
    },
  });

  const ready = file !== null && word.trim() === t('backup.restoreConfirmWord');

  return (
    <section className="mt-6 border-t border-slate-200 pt-5">
      <h3 className="text-sm font-bold text-slate-900">{t('backup.restoreTitle')}</h3>
      <p className="mt-1 text-sm text-slate-600">{t('backup.restoreHint')}</p>
      <p className="mt-1 text-sm text-slate-500">{t('backup.restoreMissing')}</p>
      <p className="mt-1 text-sm font-medium text-red-700">{t('backup.restoreWarning')}</p>

      <div className="mt-4 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(220px,0.7fr)_auto] sm:items-end">
        <label className="flex min-h-24 cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed border-slate-300 bg-slate-50/60 px-4 py-3 text-center hover:border-teal-400 hover:bg-teal-50/50">
          <span className="text-sm font-semibold text-slate-700">{t('backup.restorePick')}</span>
          <span className="mt-1 max-w-full truncate text-xs text-slate-500">
            {file?.name ?? 'JSON'}
          </span>
          <input
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(event) => {
              setFile(event.target.files?.[0] ?? null);
              setResult(null);
              setError(null);
            }}
          />
        </label>

        <label className="flex flex-col gap-2">
          <span className="text-sm font-semibold text-slate-700">{t('backup.restoreConfirm')}</span>
          <input
            aria-label={t('backup.restoreConfirm')}
            placeholder={t('backup.restoreConfirm')}
            className={inputClassName}
            value={word}
            onChange={(event) => setWord(event.target.value)}
          />
        </label>

        <Button
          variant="danger"
          disabled={!ready}
          loading={restore.isPending}
          onClick={() => restore.mutate()}
        >
          {t('backup.restoreAction')}
        </Button>
      </div>

      {result ? (
        <div className="mt-3 rounded-xl border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">
          <p className="font-semibold">{t('backup.restoreDone')}</p>
          <ul className="mt-1 flex flex-wrap gap-x-4">
            {Object.entries(result.restored).map(([table, count]) => (
              <li key={table} className="tabular-nums">
                {table}: {count}
              </li>
            ))}
          </ul>
          {result.usersNeedPasswords ? (
            <p className="mt-2 font-medium text-amber-800">
              {t('backup.restoreUsersNeedPasswords')}
            </p>
          ) : null}
          {result.skippedUsers > 0 ? (
            <p className="mt-1 text-teal-800">
              {t('backup.restoreSkippedUsers', { count: String(result.skippedUsers) })}
            </p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-3 text-sm text-red-600">
          {error}
        </p>
      ) : null}
    </section>
  );
}
