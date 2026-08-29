'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';

import { ApiClientError } from '@cheque-flow/api-client';
import type { ChequeImageSide, ChequeImageView } from '@cheque-flow/shared-types';
import { Button, Card, EmptyState } from '@cheque-flow/ui';

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
    <Card className="flex flex-col gap-4">
      <h2 className="text-lg font-semibold text-slate-900">{t('cheque.images')}</h2>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 text-sm font-medium text-slate-800">
          {t('cheque.images')}
          <select
            className="min-h-12 rounded-lg border border-slate-300 px-3"
            value={side}
            onChange={(event) => setSide(event.target.value as ChequeImageSide)}
          >
            <option value="FRONT">{t('cheque.frontImage')}</option>
            <option value="BACK">{t('cheque.backImage')}</option>
            <option value="ATTACHMENT">{t('common.optional')}</option>
          </select>
        </label>

        <input
          ref={fileInput}
          type="file"
          accept="image/jpeg,image/png,image/webp,application/pdf"
          className="min-h-12 rounded-lg border border-slate-300 p-2 text-sm"
          onChange={(event) => {
            const file = event.target.files?.[0];
            setError(null);
            if (file) upload.mutate(file);
          }}
        />
        {upload.isPending ? (
          <span className="text-sm text-slate-600">{t('capture.uploading')}</span>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {images.data && images.data.length > 0 ? (
        <ul className="flex flex-wrap gap-3">
          {images.data.map((image) => (
            <li key={image.id} className="rounded-lg border border-slate-200 p-3">
              <p className="mb-2 text-sm font-medium text-slate-800">
                {image.side === 'FRONT' ? t('cheque.frontImage') : t('cheque.backImage')}
              </p>
              <p className="mb-2 text-xs text-slate-500">
                {image.fileSize < 1024
                  ? `${image.fileSize} B`
                  : `${Math.round(image.fileSize / 1024)} KB`}
              </p>
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
        <EmptyState title={t('common.noResults')} />
      )}

      {openedUrl ? (
        <div className="flex flex-col gap-2">
          {/* Signed URLs are short lived; the image is fetched straight from storage. */}
          <img
            src={openedUrl}
            alt={t('cheque.images')}
            className="max-h-96 w-auto rounded-lg border border-slate-200"
          />
          <Button variant="ghost" onClick={() => setOpenedUrl(null)}>
            {t('common.close')}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}
