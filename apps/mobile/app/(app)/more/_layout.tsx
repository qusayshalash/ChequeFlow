import { Stack } from 'expo-router';

import { useTranslator } from '@/components/providers';
import { stackScreenOptions } from '@/components/stack-header';

export default function MoreLayout() {
  const t = useTranslator();

  return (
    <Stack screenOptions={stackScreenOptions()}>
      <Stack.Screen name="index" options={{ title: t('common.more') }} />
      <Stack.Screen name="notifications" options={{ title: t('nav.notifications') }} />
      <Stack.Screen name="reports" options={{ title: t('reports.title') }} />
      <Stack.Screen name="users" options={{ title: t('user.title') }} />
      <Stack.Screen name="settings" options={{ title: t('nav.settings') }} />
    </Stack>
  );
}
