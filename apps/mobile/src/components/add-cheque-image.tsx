import { useMutation, useQueryClient } from '@tanstack/react-query';
import { File } from 'expo-file-system';
import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';

import { ApiClientError } from '@cheque-flow/api-client';

import { useApi, useTranslator } from '@/components/providers';
import { Button } from '@/components/ui';
import * as haptics from '@/lib/haptics';
import { useStyles } from '@/theme-context';
import { TAP, radius, space, type, type Palette } from '@/theme';

type Side = 'FRONT' | 'BACK';

/**
 * Adding a photograph to a cheque already recorded.
 *
 * The camera used to be reachable only through capture, which reads the
 * cheque; with reading turned off on the server the camera went with it, and
 * a cheque entered by hand could never get its picture. This stores the image
 * and nothing else: no reading, no change to the cheque's data.
 *
 * The side is chosen first, because it is what the image is filed under; then
 * the camera or the phone's gallery.
 */
export function AddChequeImage({ chequeId }: { chequeId: string }) {
  const styles = useStyles(makeStyles);
  const api = useApi();
  const t = useTranslator();
  const queryClient = useQueryClient();
  const [side, setSide] = useState<Side>('FRONT');
  const [added, setAdded] = useState(false);

  const upload = useMutation({
    mutationFn: async ({ uri, allowDuplicate }: { uri: string; allowDuplicate: boolean }) => {
      const form = new FormData();
      // A real file, not a `{ uri, name, type }` descriptor: Expo's fetch
      // rejects that shape (see cheque-upload.ts for the whole story).
      form.append('file', new File(uri) as unknown as Blob);
      form.append('side', side);
      form.append('capturedAt', new Date().toISOString());
      return api.uploadChequeImage(chequeId, form, allowDuplicate);
    },
    onSuccess: () => {
      haptics.recorded();
      setAdded(true);
      void queryClient.invalidateQueries({ queryKey: ['cheque', chequeId] });
    },
    onError: (error: unknown, variables) => {
      // The same photograph is on another cheque. Usually a mistake, so it is
      // asked rather than refused outright, and never uploaded silently.
      if (error instanceof ApiClientError && error.code === 'DUPLICATE_CHEQUE') {
        haptics.needsAttention();
        Alert.alert(t('cheque.addImage'), t('cheque.imageDuplicate'), [
          { text: t('common.cancel'), style: 'cancel' },
          {
            text: t('cheque.uploadAnyway'),
            onPress: () => upload.mutate({ uri: variables.uri, allowDuplicate: true }),
          },
        ]);
        return;
      }
      Alert.alert(
        t('cheque.addImage'),
        error instanceof ApiClientError ? t(error.messageKey) : t('capture.uploadFailed'),
      );
    },
  });

  async function pick(source: 'camera' | 'gallery'): Promise<void> {
    setAdded(false);
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(t('cheque.addImage'), t('cheque.cameraDenied'));
        return;
      }
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.7 };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? undefined : result.assets[0];
    if (asset) upload.mutate({ uri: asset.uri, allowDuplicate: false });
  }

  return (
    <View style={styles.box}>
      <Text style={styles.title}>{t('cheque.addImage')}</Text>
      <View style={styles.sides} accessibilityRole="radiogroup">
        {(['FRONT', 'BACK'] as const).map((value) => (
          <Pressable
            key={value}
            accessibilityRole="radio"
            accessibilityState={{ checked: side === value }}
            onPress={() => setSide(value)}
            style={[styles.side, side === value && styles.sideOn]}
          >
            <Text style={[styles.sideText, side === value && styles.sideTextOn]}>
              {t(value === 'FRONT' ? 'cheque.frontImage' : 'cheque.backImage')}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.actions}>
        <View style={styles.action}>
          <Button
            label={t('cheque.takePhoto')}
            onPress={() => void pick('camera')}
            loading={upload.isPending}
          />
        </View>
        <View style={styles.action}>
          <Button
            label={t('cheque.fromGallery')}
            variant="secondary"
            onPress={() => void pick('gallery')}
            disabled={upload.isPending}
          />
        </View>
      </View>
      {added ? <Text style={styles.added}>{t('cheque.imageAdded')}</Text> : null}
    </View>
  );
}

const makeStyles = (c: Palette) =>
  StyleSheet.create({
    box: {
      marginTop: space['3'],
      paddingTop: space['3'],
      borderTopWidth: 1,
      borderTopColor: c.surface.line,
      gap: space['2'],
    },
    title: { ...type.bodyStrong, color: c.text.primary },
    sides: {
      flexDirection: 'row',
      backgroundColor: c.surface.sunken,
      borderRadius: radius.md,
      padding: 3,
    },
    side: {
      flex: 1,
      minHeight: TAP - 8,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.sm,
    },
    sideOn: { backgroundColor: c.surface.card },
    sideText: { ...type.callout, color: c.text.secondary },
    sideTextOn: { color: c.accent.dark },
    actions: { flexDirection: 'row', gap: space['2'] },
    action: { flex: 1 },
    added: { ...type.caption, color: c.semantic.success },
  });
