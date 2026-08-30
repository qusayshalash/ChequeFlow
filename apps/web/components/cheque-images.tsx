'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { ApiClientError } from '@cheque-flow/api-client';
import type { ChequeImageSide, ChequeImageView } from '@cheque-flow/shared-types';
import { Button } from '@cheque-flow/ui';

import { IconCamera } from '@/components/icons';
import { Panel } from '@/components/panel';
import { useApi, useTranslator } from '@/components/providers';

/** Upload and view cheque images. Images are fetched through signed URLs. */
export function ChequeImagesPanel({
  chequeId,
  canViewImages,
}: {
  chequeId: string;
  canViewImages: boolean;
}) {
  const api = useApi();
  const t = useTranslator();
  const queryClient = useQueryClient();
  const fileInput = useRef<HTMLInputElement>(null);

  const [side, setSide] = useState<ChequeImageSide>('FRONT');
  const [error, setError] = useState<string | null>(null);
  const [openedUrl, setOpenedUrl] = useState<string | null>(null);

  const images = useQuery<ChequeImageView[]>({
    queryKey: ['cheque-images', chequeId],
    queryFn: () => api.listChequeImages(chequeId),
  });

  const upload = useMutation({
    mutationFn: (file: File) => {
      const form = new FormData();
      form.append('file', file);
      form.append('side', side);
      form.append('capturedAt', new Date().toISOString());
      return api.uploadChequeImage(chequeId, form);
    },
    onSuccess: () => {
      if (fileInput.current) fileInput.current.value = '';
      void queryClient.invalidateQueries({ queryKey: ['cheque-images', chequeId] });
      void queryClient.invalidateQueries({ queryKey: ['cheque', chequeId] });
    },
    onError: (caught: unknown) => {
      setError(caught instanceof ApiClientError ? t(caught.messageKey) : t('capture.uploadFailed'));
    },
  });

  const openImage = useMutation({
    mutationFn: (imageId: string) => api.getChequeImageUrl(chequeId, imageId),
    onSuccess: (result) => setOpenedUrl(result.url),
    onError: (caught: unknown) => {
      setError(
        caught instanceof ApiClientError ? t(caught.messageKey) : t('errors.INTERNAL_ERROR'),
      );
    },
  });

  return (
    <Panel title={t('cheque.images')}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-center gap-2">
          {/* Which side is being uploaded, as two buttons rather than a select:
              there are only ever two answers and both fit on one line. */}
          {(['FRONT', 'BACK'] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setSide(value)}
              aria-pressed={side === value}
              className={`h-9 rounded-lg px-3 text-sm font-semibold transition-colors ${
                side === value
                  ? 'bg-teal-800 text-white'
                  : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {value === 'FRONT' ? t('cheque.frontImage') : t('cheque.backImage')}
            </button>
          ))}
        </div>

        {/* The native file input is replaced by a styled label pointing at a
            hidden one: browsers render "Choose File" in their own language and
            their own look, which in an Arabic interface reads as a bug. */}
        <label
          className={`flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 px-4 py-5 text-sm font-semibold text-slate-600 transition-colors hover:border-teal-400 hover:bg-teal-50 hover:text-teal-700 ${
            upload.isPending ? 'pointer-events-none opacity-60' : ''
          }`}
        >
          <IconCamera />
          {upload.isPending ? t('capture.uploading') : t('capture.usePhoto')}
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp,application/pdf"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0];
              setError(null);
              if (file) upload.mutate(file);
            }}
          />
        </label>

        {error ? (
          <p role="alert" className="rounded-xl bg-red-50 p-3 text-sm text-red-700">
            {error}
          </p>
        ) : null}

        {images.data && images.data.length > 0 ? (
          <ul className="flex flex-col gap-2">
            {images.data.map((image) => (
              <li
                key={image.id}
                className="flex items-center justify-between gap-3 rounded-xl border border-slate-200 p-3"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-800">
                    {image.side === 'FRONT' ? t('cheque.frontImage') : t('cheque.backImage')}
                  </span>
                  <span className="block text-xs text-slate-500 tabular-nums">
                    {image.fileSize < 1024
                      ? `${image.fileSize} B`
                      : `${Math.round(image.fileSize / 1024)} KB`}
                  </span>
                </span>
                <Button
                  variant="secondary"
                  disabled={!canViewImages}
                  onClick={() => openImage.mutate(image.id)}
                >
                  {t('common.view')}
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-slate-400">{t('cheque.noImages')}</p>
        )}

        {openedUrl ? (
          <div className="flex flex-col gap-2">
            {/* Signed URLs are short lived; the image is fetched straight from storage. */}
            <img
              src={openedUrl}
              alt={t('cheque.images')}
              className="w-full rounded-xl border border-slate-200"
            />
            <Button variant="ghost" onClick={() => setOpenedUrl(null)}>
              {t('common.close')}
            </Button>
          </div>
        ) : null}
      </div>
    </Panel>
  );
}
