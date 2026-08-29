import { useQuery } from '@tanstack/react-query';
import { Redirect } from 'expo-router';

import { LoadingView } from '@/components/ui';
import { useApi, useTranslator } from '@/components/providers';

/** Decides between the dashboard and the login screen on cold start. */
export default function IndexScreen() {
  const api = useApi();
  const t = useTranslator();

  const session = useQuery({
    queryKey: ['session'],
    queryFn: () => api.me(),
    retry: false,
  });

  if (session.isPending) return <LoadingView label={t('common.loading')} />;
  return <Redirect href={session.isSuccess ? '/(app)/dashboard' : '/login'} />;
}
