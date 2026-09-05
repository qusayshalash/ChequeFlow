import { useQuery } from '@tanstack/react-query';
import { LinearGradient } from 'expo-linear-gradient';
import { Redirect, Tabs } from 'expo-router';
import { Platform, StyleSheet, type ColorValue } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, MIN_TOUCH_TARGET } from '@cheque-flow/ui/tokens';

import { BiometricGate } from '@/components/biometric-gate';
import {
  IconCheque,
  IconContacts,
  IconDashboard,
  IconMenu,
  IconPlus,
  type IconProps,
} from '@/components/icons';
import { useApi, useApp, useTranslator } from '@/components/providers';
import { LoadingView } from '@/components/ui';
import { pageGradient } from '@/theme';

/**
 * Draws a tab's icon in the tint the navigator asks for.
 *
 * The icons used to be emoji. They rendered as a different drawing on every OS
 * version, could not take the brand colour, and a screen reader announced the
 * picture rather than the destination.
 */
function tabIcon(Icon: (props: IconProps) => React.ReactElement) {
  // `ColorValue`, not `string`: SDK 57's tab bar widened this to the type that
  // also covers a platform colour object. Narrowing it back would be a lie
  // about what the navigator can hand us, so it is converted at the boundary
  // instead — the icons take a plain colour, and every value this app puts in
  // the tab bar is one.
  return function TabBarIcon({ color, size }: { color: ColorValue; size: number }) {
    return <Icon size={size} color={String(color)} />;
  };
}

/**
 * Guards every authenticated screen and provides the bottom navigation.
 *
 * Five destinations, with capture in the middle: the long menu that used to
 * live on the home screen made the app's main job — recording a cheque — three
 * taps deep.
 */
export default function AppLayout() {
  const api = useApi();
  const t = useTranslator();
  const { ready } = useApp();
  const insets = useSafeAreaInsets();

  const session = useQuery({ queryKey: ['session'], queryFn: () => api.me(), retry: false });

  if (!ready || session.isPending) return <LoadingView label={t('common.loading')} />;
  if (session.isError) return <Redirect href="/login" />;

  return (
    <BiometricGate>
      {/* The sign-in screen's mint field, painted once behind every tab rather
          than repeated in nineteen screens. `sceneContainerStyle` is
          transparent so this shows through; each screen keeps its own padding
          and draws its cards on top. */}
      <LinearGradient
        colors={[...pageGradient]}
        locations={[0, 0.45, 1]}
        style={StyleSheet.absoluteFill}
      />
      <Tabs
        screenOptions={{
          headerShown: false,
          // Transparent, so the gradient above shows through every tab.
          sceneStyle: { backgroundColor: 'transparent' },
          tabBarActiveTintColor: colors.brand,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.border,
            // The gesture bar sits on top of the tab bar on modern phones, so
            // the bar grows by the inset rather than letting the system draw
            // over the labels.
            height: MIN_TOUCH_TARGET + 16 + insets.bottom,
            paddingBottom: insets.bottom + 6,
            paddingTop: 8,
          },
          tabBarItemStyle: { paddingVertical: 2 },
          tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: '600',
            // Arabic ascenders and descenders are taller than Latin ones; the
            // default line height clips them on Android.
            lineHeight: 16,
          },
          // Android's default ripple is a grey circle that ignores the brand.
          ...(Platform.OS === 'android'
            ? { tabBarAndroidRipple: { color: colors.brandLight, borderless: false } }
            : {}),
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t('common.home'),
            tabBarIcon: tabIcon(IconDashboard),
          }}
        />
        <Tabs.Screen
          name="cheques"
          options={{
            title: t('nav.cheques'),
            tabBarIcon: tabIcon(IconCheque),
          }}
        />
        <Tabs.Screen
          name="add"
          options={{
            title: t('common.add'),
            tabBarIcon: tabIcon(IconPlus),
          }}
        />
        <Tabs.Screen
          name="contacts"
          options={{
            title: t('contact.title'),
            tabBarIcon: tabIcon(IconContacts),
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: t('common.more'),
            tabBarIcon: tabIcon(IconMenu),
          }}
        />
        {/* Reached from the "add" tab, not a destination of its own. */}
        <Tabs.Screen name="capture" options={{ href: null }} />
      </Tabs>
    </BiometricGate>
  );
}
