import { Stack } from 'expo-router';

import { useTranslator } from '@/components/providers';
import { stackScreenOptions } from '@/components/stack-header';

export default function ContactsLayout() {
  const t = useTranslator();

  return (
    <Stack screenOptions={stackScreenOptions()}>
      <Stack.Screen name="index" options={{ title: t('contact.title') }} />
      <Stack.Screen name="new" options={{ title: t('contact.newTitle') }} />
      <Stack.Screen name="[id]/index" options={{ title: t('contact.statement') }} />
      <Stack.Screen name="[id]/edit" options={{ title: t('contact.editTitle') }} />
    </Stack>
  );
}
