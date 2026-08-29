import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiClientError } from '@cheque-flow/api-client';
import { ChequeDirection } from '@cheque-flow/shared-types';
import { colors, radius, spacing } from '@cheque-flow/ui/tokens';

import { useApi, useTranslator } from '@/components/providers';
import { Body, Button, Card, Heading, Screen } from '@/components/ui';
import { checkCaptureQuality } from '@/lib/image-quality';
import { saveDraft } from '@/lib/draft-store';

type Side = 'FRONT' | 'BACK';

interface Shot {
  uri: string;
  width: number;
  height: number;
}

/**
 * Capture pipeline, steps 1-4:
 *   capture → quality check → upload → OCR (the review screen continues).
 *
 * When the upload fails the capture is kept as a local draft so nothing the
 * user photographed is lost.
 */
export default function CaptureScreen() {
  const api = useApi();
  const t = useTranslator();
  const router = useRouter();
  const camera = useRef<CameraView>(null);

  const [permission, requestPermission] = useCameraPermissions();
  const [side, setSide] = useState<Side>('FRONT');
  const [shots, setShots] = useState<Partial<Record<Side, Shot>>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  if (!permission) {
    return (
      <Screen>
        <Body>{t('common.loading')}</Body>
      </Screen>
    );
  }

  if (!permission.granted) {
    return (
      <Screen>
        <Heading>{t('capture.title')}</Heading>
        <Body muted>{t('capture.permissionDenied')}</Body>
        <Button label={t('common.confirm')} onPress={() => void requestPermission()} large />
      </Screen>
    );
  }

  async function takePhoto(): Promise<void> {
    setError(null);
    setWarning(null);
    const photo = await camera.current?.takePictureAsync({ quality: 0.8, skipProcessing: false });
    if (!photo) return;

    const quality = checkCaptureQuality({
      width: photo.width,
      height: photo.height,
      // `takePictureAsync` does not report the byte size; approximate it from
      // the pixel count so the obvious oversize cases are still caught.
      fileSize: Math.round((photo.width * photo.height) / 4),
    });

    if (!quality.ok) {
      setWarning(quality.messageKeys.map((key) => t(key)).join(' · '));
    }

    setShots((current) => ({
      ...current,
      [side]: { uri: photo.uri, width: photo.width, height: photo.height },
    }));
    setSide(side === 'FRONT' ? 'BACK' : 'FRONT');
  }

  async function uploadAndContinue(): Promise<void> {
    const front = shots.FRONT;
    if (!front) return;

    setBusy(true);
    setError(null);
    try {
      // Phase 1 creates a draft cheque, then attaches the images to it; the
      // reviewer fills in the real values on the next screen.
      const today = new Date().toISOString().slice(0, 10);
      const created = await api.createCheque(
        {
          direction: ChequeDirection.INCOMING,
          chequeNumber: `TMP-${Date.now().toString().slice(-8)}`,
          amount: '1.00',
          currency: 'SAR',
          dueDate: today,
          issueDate: null,
          receivedDate: today,
          branchId: null,
          bankId: null,
          bankNameRaw: null,
          bankBranchRaw: null,
          accountNumber: null,
          drawerName: null,
          originalSourceId: null,
          originalPayeeName: null,
          currentLocationId: null,
          purpose: null,
          referenceNumber: null,
          notes: null,
        },
        true,
      );

      for (const currentSide of ['FRONT', 'BACK'] as const) {
        const shot = shots[currentSide];
        if (!shot) continue;
        const form = new FormData();
        // React Native's FormData accepts this file descriptor shape.
        form.append('file', {
          uri: shot.uri,
          name: `${currentSide.toLowerCase()}.jpg`,
          type: 'image/jpeg',
        } as unknown as Blob);
        form.append('side', currentSide);
        form.append('capturedAt', new Date().toISOString());
        await api.uploadChequeImage(created.cheque.id, form, true);
      }

      await api.processOcr(created.cheque.id);
      router.replace(`/(app)/cheques/${created.cheque.id}/review`);
    } catch (caught) {
      // Keep the capture locally so a flaky connection never loses work.
      await saveDraft({
        createdAt: new Date().toISOString(),
        images: Object.entries(shots).map(([key, shot]) => ({ side: key, uri: shot.uri })),
      });
      setError(caught instanceof ApiClientError ? t(caught.messageKey) : t('errors.offline'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Heading>{side === 'FRONT' ? t('capture.front') : t('capture.back')}</Heading>

      <View style={styles.cameraBox}>
        <CameraView ref={camera} style={styles.camera} facing="back" />
      </View>

      <Button label={t('capture.button')} onPress={() => void takePhoto()} large />

      {warning ? <Text style={styles.warning}>{warning}</Text> : null}

      <Card>
        <Body>{t('cheque.images')}</Body>
        <View style={styles.thumbs}>
          {(['FRONT', 'BACK'] as const).map((key) => {
            const shot = shots[key];
            return (
              <View key={key} style={styles.thumbBox}>
                <Text style={styles.thumbLabel}>
                  {key === 'FRONT' ? t('cheque.frontImage') : t('cheque.backImage')}
                </Text>
                {shot ? (
                  <Image source={{ uri: shot.uri }} style={styles.thumb} resizeMode="cover" />
                ) : (
                  <View style={[styles.thumb, styles.thumbEmpty]} />
                )}
                {shot ? (
                  <Button
                    label={t('capture.retake')}
                    variant="secondary"
                    onPress={() => {
                      setShots((current) => ({ ...current, [key]: undefined }));
                      setSide(key);
                    }}
                  />
                ) : null}
              </View>
            );
          })}
        </View>
      </Card>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Button
        label={busy ? t('capture.uploading') : t('capture.usePhoto')}
        onPress={() => void uploadAndContinue()}
        disabled={!shots.FRONT}
        loading={busy}
        large
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: spacing.md, gap: spacing.md, backgroundColor: colors.surfaceMuted },
  cameraBox: { height: 260, borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#000' },
  camera: { flex: 1 },
  thumbs: { flexDirection: 'row', gap: spacing.sm },
  thumbBox: { flex: 1, gap: spacing.xs },
  thumbLabel: { fontSize: 13, color: colors.textMuted, textAlign: 'right' },
  thumb: {
    width: '100%',
    height: 90,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
  thumbEmpty: { borderWidth: 1, borderColor: colors.border, borderStyle: 'dashed' },
  warning: { color: colors.warning, fontSize: 14, textAlign: 'right' },
  error: { color: colors.danger, fontSize: 14, textAlign: 'right' },
});
