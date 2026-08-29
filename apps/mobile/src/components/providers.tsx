import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

import { ApiClientError, ChequeFlowApiClient } from '@cheque-flow/api-client';
import { createTranslator, type Locale, type Translator } from '@cheque-flow/localization';

import { API_URL, defaultLocale } from '@/lib/config';
import { SecureTokenStore } from '@/lib/secure-token-store';

interface AppContextValue {
  api: ChequeFlowApiClient;
  locale: Locale;
  t: Translator;
}

const AppContext = createContext<AppContextValue | null>(null);

export function useApp(): AppContextValue {
  const context = useContext(AppContext);
  if (!context) throw new Error('useApp must be used inside <Providers>');
  return context;
}

export function useApi(): ChequeFlowApiClient {
  return useApp().api;
}

export function useTranslator(): Translator {
  return useApp().t;
}

export function Providers({ children }: { children: ReactNode }) {
  const router = useRouter();
  const storeRef = useRef<SecureTokenStore>(null);
  storeRef.current ??= new SecureTokenStore();

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            // Mobile networks fail often; retry transient errors only.
            retry: (failureCount, error) =>
              error instanceof ApiClientError && error.status > 0 && error.status < 500
                ? false
                : failureCount < 3,
          },
        },
      }),
  );

  const locale = defaultLocale();

  const value = useMemo<AppContextValue>(
    () => ({
      api: new ChequeFlowApiClient({
        baseUrl: API_URL,
        tokenStore: storeRef.current as SecureTokenStore,
        onSessionExpired: () => {
          queryClient.clear();
          router.replace('/login');
        },
      }),
      locale,
      t: createTranslator(locale),
    }),
    [locale, queryClient, router],
  );

  return (
    <QueryClientProvider client={queryClient}>
      <AppContext.Provider value={value}>{children}</AppContext.Provider>
    </QueryClientProvider>
  );
}
