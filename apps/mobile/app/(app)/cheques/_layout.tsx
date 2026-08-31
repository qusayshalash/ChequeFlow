import { Stack } from 'expo-router';

import { useTranslator } from '@/components/providers';
import { stackScreenOptions } from '@/components/stack-header';

export default function ChequesLayout() {
  const t = useTranslator();

  return (
    <Stack screenOptions={stackScreenOptions()}>
      <Stack.Screen name="index" options={{ title: t('cheque.listTitle') }} />
      <Stack.Screen name="new" options={{ title: t('cheque.newTitle') }} />
      <Stack.Screen name="batch" options={{ title: t('cheque.batchTitle') }} />
      <Stack.Screen name="[id]/index" options={{ title: t('cheque.title') }} />
      <Stack.Screen name="[id]/edit" options={{ title: t('cheque.editTitle') }} />
      <Stack.Screen name="[id]/action" options={{ title: t('common.actions') }} />
      <Stack.Screen name="[id]/review" options={{ title: t('ocr.reviewTitle') }} />
      <Stack.Screen name="[id]/timeline" options={{ title: t('cheque.timeline') }} />
      <Stack.Screen name="[id]/remind" options={{ title: t('reminders.addCustom') }} />
    </Stack>
  );
}
