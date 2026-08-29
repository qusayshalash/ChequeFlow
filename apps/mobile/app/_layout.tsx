import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { I18nManager } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { Providers } from '@/components/providers';

/**
 * Root layout.
 *
 * The interface is Arabic-first, so RTL is enabled at startup. On native a
 * layout-direction flip needs an app restart, which Expo performs on the next
 * launch; the app is already laid out with logical alignment so the first run
 * is readable either way.
 */
export default function RootLayout() {
  useEffect(() => {
    I18nManager.allowRTL(true);
    if (!I18nManager.isRTL) {
      I18nManager.forceRTL(true);
    }
  }, []);

  return (
    <SafeAreaProvider>
      <Providers>
        <StatusBar style="dark" />
        <Stack screenOptions={{ headerTitleAlign: 'center' }}>
          <Stack.Screen name="index" options={{ headerShown: false }} />
          <Stack.Screen name="login" options={{ headerShown: false }} />
          <Stack.Screen name="(app)" options={{ headerShown: false }} />
        </Stack>
      </Providers>
    </SafeAreaProvider>
  );
}
