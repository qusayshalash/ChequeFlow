import { useQuery } from '@tanstack/react-query';
import { Redirect, Tabs } from 'expo-router';
import { Text } from 'react-native';

import { colors } from '@cheque-flow/ui/tokens';

import { BiometricGate } from '@/components/biometric-gate';
import { useApi, useApp, useTranslator } from '@/components/providers';
import { LoadingView } from '@/components/ui';

/**
 * Icons are text glyphs rather than an icon font.
 *
 * Adding `@expo/vector-icons` would pull in font assets and another package
 * that must stay aligned with the Expo Go version the phone has installed —
 * the exact class of dependency that broke this app once already. Glyphs need
 * nothing and render on both platforms.
 */
function TabIcon({ glyph, focused }: { glyph: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 22, opacity: focused ? 1 : 0.55 }} accessibilityElementsHidden>
      {glyph}
    </Text>
  );
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

  const session = useQuery({ queryKey: ['session'], queryFn: () => api.me(), retry: false });

  if (!ready || session.isPending) return <LoadingView label={t('common.loading')} />;
  if (session.isError) return <Redirect href="/login" />;

  return (
    <BiometricGate>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarActiveTintColor: colors.brand,
          tabBarInactiveTintColor: colors.textMuted,
          tabBarStyle: { backgroundColor: colors.surface, borderTopColor: colors.border },
          tabBarLabelStyle: { fontSize: 12 },
        }}
      >
        <Tabs.Screen
          name="index"
          options={{
            title: t('common.home'),
            tabBarIcon: ({ focused }) => <TabIcon glyph="🏠" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="cheques"
          options={{
            title: t('nav.cheques'),
            tabBarIcon: ({ focused }) => <TabIcon glyph="🧾" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="add"
          options={{
            title: t('common.add'),
            tabBarIcon: ({ focused }) => <TabIcon glyph="➕" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="contacts"
          options={{
            title: t('contact.title'),
            tabBarIcon: ({ focused }) => <TabIcon glyph="👥" focused={focused} />,
          }}
        />
        <Tabs.Screen
          name="more"
          options={{
            title: t('common.more'),
            tabBarIcon: ({ focused }) => <TabIcon glyph="☰" focused={focused} />,
          }}
        />
        {/* Reached from the "add" tab, not a destination of its own. */}
        <Tabs.Screen name="capture" options={{ href: null }} />
      </Tabs>
    </BiometricGate>
  );
}
