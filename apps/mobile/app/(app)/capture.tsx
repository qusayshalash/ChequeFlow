import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';

import { ApiClientError } from '@cheque-flow/api-client';
import { colors } from '@cheque-flow/ui/tokens';

import { useApi, useTranslator } from '@/components/providers';
import { Body, Button, Card, Heading, Screen } from '@/components/ui';
import { checkCaptureQuality } from '@/lib/image-quality';
import { uploadCapturedCheque } from '@/lib/cheque-upload';
import { saveDraft } from '@/lib/draft-store';
import { radius, space, surface, text } from '@/theme';

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

    const images = Object.entries(shots).map(([key, shot]) => ({ side: key, uri: shot.uri }));

    try {
      const chequeId = await uploadCapturedCheque(api, images);
      router.replace(`/(app)/cheques/${chequeId}/review`);
    } catch (caught) {
      // Keep the capture locally so a flaky connection never loses work. The
      // draft is uploaded by `syncDrafts` as soon as the API is reachable
      // again — it is a real queue, not a record of what was lost.
      await saveDraft({ createdAt: new Date().toISOString(), images });
      setError(caught instanceof ApiClientError ? t(caught.messageKey) : t('errors.queuedOffline'));
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
  container: { padding: space['4'], gap: space['4'], backgroundColor: surface.page },
  cameraBox: { height: 260, borderRadius: radius.md, overflow: 'hidden', backgroundColor: '#000' },
  camera: { flex: 1 },
  thumbs: { flexDirection: 'row', gap: space['2'] },
  thumbBox: { flex: 1, gap: space['1'] },
  thumbLabel: { fontSize: 13, color: text.secondary, textAlign: 'right' },
  thumb: {
    width: '100%',
    height: 90,
    borderRadius: radius.sm,
    backgroundColor: surface.page,
  },
  thumbEmpty: { borderWidth: 1, borderColor: surface.line, borderStyle: 'dashed' },
  warning: { color: colors.warning, fontSize: 14, textAlign: 'right' },
  error: { color: colors.danger, fontSize: 14, textAlign: 'right' },
});
