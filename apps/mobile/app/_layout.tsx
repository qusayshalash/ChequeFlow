import {
  IBMPlexSansArabic_400Regular,
  IBMPlexSansArabic_500Medium,
  IBMPlexSansArabic_600SemiBold,
  IBMPlexSansArabic_700Bold,
  useFonts,
} from '@expo-google-fonts/ibm-plex-sans-arabic';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { I18nManager } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Providers } from '@/components/providers';
import { ThemeProvider } from '@/theme-context';

// Held until the typeface is in memory. Without this the first frame paints in
// the system face and every line re-flows a moment later — the app's first
// impression is a flicker.
void SplashScreen.preventAutoHideAsync();

/**
 * Root layout.
 *
 * The interface is Arabic-first, so RTL is enabled at startup. On native a
 * layout-direction flip needs an app restart, which Expo performs on the next
 * launch; the app is already laid out with logical alignment so the first run
 * is readable either way.
 */
export default function RootLayout() {
  const [fontsReady, fontError] = useFonts({
    IBMPlexSansArabic_400Regular,
    IBMPlexSansArabic_500Medium,
    IBMPlexSansArabic_600SemiBold,
    IBMPlexSansArabic_700Bold,
  });

  useEffect(() => {
    I18nManager.allowRTL(true);
    if (!I18nManager.isRTL) {
      I18nManager.forceRTL(true);
    }
  }, []);

  useEffect(() => {
    // A font that fails to load is not a reason to show nothing: the app falls
    // back to the system face and carries on, rather than holding the splash
    // screen on a phone that will never resolve it.
    if (fontsReady || fontError) void SplashScreen.hideAsync();
  }, [fontsReady, fontError]);

  if (!fontsReady && !fontError) return null;

  return (
    <SafeAreaProvider>
      <ThemeProvider>
        <Providers>
          {/* `auto` rather than a fixed tint: the bar sits on the app's own
            ground, which is now light or dark by the phone's setting. */}
          <StatusBar style="auto" />
          <Stack screenOptions={{ headerTitleAlign: 'center' }}>
            <Stack.Screen name="index" options={{ headerShown: false }} />
            <Stack.Screen name="login" options={{ headerShown: false }} />
            <Stack.Screen name="(app)" options={{ headerShown: false }} />
          </Stack>
        </Providers>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
