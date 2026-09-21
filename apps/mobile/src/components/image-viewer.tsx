import { useCallback, useRef, useState } from 'react';
import {
  Animated,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { IconClose } from '@/components/icons';
import { useTranslator } from '@/components/providers';
import { useMotionDurations } from '@/lib/reduced-motion';
import { radius, space, type, type Palette } from '@/theme';
import { useStyles } from '@/theme-context';

/**
 * Looking at a cheque properly.
 *
 * The photographs are 2178×3024 — a good six megapixels, kept since the first
 * capture — and the record screen showed them at 320×200, with a tap that
 * toggled to a slightly larger thumbnail. At that size a handwritten amount is
 * a smudge and a signature is a line, which leaves the app storing the one
 * thing it was built to store and refusing to show it.
 *
 * So: the whole screen, on black, with the image free to be magnified.
 *
 * Zoom is done twice on purpose. iOS gives real pinch-to-zoom through the
 * scroll view for nothing, and it is the gesture people already know. Android's
 * scroll view has no zoom at all, so a double tap steps between fitting the
 * screen and two and a half times that, and the same scroll view pans the
 * result. The double tap is wired on both, because it is faster than pinching
 * when all you want is a closer look at the amount.
 */
const CLOSE_SCALE = 2.5;
/** Two taps further apart than this are two taps, not one gesture. */
const DOUBLE_TAP_MS = 280;

export function ImageViewer({
  url,
  label,
  onClose,
}: {
  url: string | null;
  label: string;
  onClose: () => void;
}) {
  const t = useTranslator();
  const styles = useStyles(makeStyles);
  const { width, height } = useWindowDimensions();
  const durations = useMotionDurations();

  const scale = useRef(new Animated.Value(1)).current;
  const [magnified, setMagnified] = useState(false);
  const lastTap = useRef(0);

  const toggle = useCallback(() => {
    const now = Date.now();
    if (now - lastTap.current > DOUBLE_TAP_MS) {
      lastTap.current = now;
      return;
    }
    lastTap.current = 0;

    const next = magnified ? 1 : CLOSE_SCALE;
    setMagnified(!magnified);
    Animated.timing(scale, {
      toValue: next,
      duration: durations.enter,
      useNativeDriver: true,
    }).start();
  }, [magnified, scale, durations.enter]);

  return (
    <Modal
      visible={url !== null}
      animationType="fade"
      onRequestClose={onClose}
      supportedOrientations={['portrait', 'landscape']}
    >
      {/* Black rather than the app's ground: a photograph is judged against
          what surrounds it, and a pale frame washes out a pale cheque. */}
      <View style={styles.stage}>
        <SafeAreaView style={styles.bar} edges={['top']}>
          <Text style={styles.label} numberOfLines={1}>
            {label}
          </Text>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('common.close')}
            onPress={onClose}
            hitSlop={12}
            style={styles.close}
          >
            <IconClose size={22} color="#ffffff" />
          </Pressable>
        </SafeAreaView>

        <ScrollView
          style={styles.pane}
          contentContainerStyle={styles.paneContent}
          maximumZoomScale={4}
          minimumZoomScale={1}
          bouncesZoom
          centerContent
          showsVerticalScrollIndicator={false}
          showsHorizontalScrollIndicator={false}
        >
          <Pressable
            onPress={toggle}
            accessibilityRole="imagebutton"
            accessibilityLabel={label}
            accessibilityHint={t('cheque.imageZoomHint')}
          >
            <Animated.View style={{ transform: [{ scale }] }}>
              {url ? (
                <Image
                  source={{ uri: url }}
                  // Fills the screen rather than a fixed box: the cheque is
                  // wider than it is tall, so the width is what matters.
                  style={{ width, height: height * 0.7 }}
                  resizeMode="contain"
                  accessible
                />
              ) : null}
            </Animated.View>
          </Pressable>
        </ScrollView>

        <SafeAreaView style={styles.footer} edges={['bottom']}>
          <Text style={styles.hint}>
            {Platform.OS === 'ios' ? t('cheque.imageZoomHint') : t('cheque.imageTapHint')}
          </Text>
        </SafeAreaView>
      </View>
    </Modal>
  );
}

const makeStyles = (_c: Palette) =>
  StyleSheet.create({
    // Deliberately not from the palette: this screen is black in both themes.
    stage: { flex: 1, backgroundColor: '#000000' },
    bar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: space['3'],
      paddingHorizontal: space['4'],
      paddingVertical: space['2'],
    },
    label: { ...type.label, color: '#ffffff', flex: 1, textAlign: 'right' },
    close: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
    },
    pane: { flex: 1 },
    paneContent: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
    footer: { paddingHorizontal: space['4'], paddingBottom: space['2'] },
    hint: { ...type.caption, color: '#8b9794', textAlign: 'center' },
  });
