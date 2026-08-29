import { useQuery } from '@tanstack/react-query';
import { Redirect, Stack } from 'expo-router';

import { useApi, useTranslator } from '@/components/providers';
import { LoadingView } from '@/components/ui';

/** Guards every authenticated screen. */
export default function AppLayout() {
  const api = useApi();
  const t = useTranslator();

  const session = useQuery({ queryKey: ['session'], queryFn: () => api.me(), retry: false });

  if (session.isPending) return <LoadingView label={t('common.loading')} />;
  if (session.isError) return <Redirect href="/login" />;

  return (
    <Stack screenOptions={{ headerTitleAlign: 'center', headerBackButtonDisplayMode: 'minimal' }}>
      <Stack.Screen name="dashboard" options={{ title: t('dashboard.title') }} />
      <Stack.Screen name="capture" options={{ title: t('capture.title') }} />
      <Stack.Screen name="cheques/index" options={{ title: t('cheque.listTitle') }} />
      <Stack.Screen name="cheques/[id]/index" options={{ title: t('cheque.title') }} />
      <Stack.Screen name="cheques/[id]/timeline" options={{ title: t('cheque.timeline') }} />
      <Stack.Screen name="cheques/[id]/action" options={{ title: t('common.actions') }} />
      <Stack.Screen name="cheques/[id]/review" options={{ title: t('ocr.reviewTitle') }} />
      <Stack.Screen name="contacts" options={{ title: t('contact.title') }} />
      <Stack.Screen name="notifications" options={{ title: t('nav.notifications') }} />
      <Stack.Screen name="settings" options={{ title: t('nav.settings') }} />
    </Stack>
  );
}
