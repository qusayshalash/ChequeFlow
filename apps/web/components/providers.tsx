'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { createContext, useContext, useMemo, useRef, useState, type ReactNode } from 'react';

import { ChequeFlowApiClient, ApiClientError } from '@cheque-flow/api-client';
import { createTranslator, type Locale, type Translator } from '@cheque-flow/localization';

import { API_URL } from '@/lib/config';
import { BrowserTokenStore } from '@/lib/token-store';

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

/** Convenience hooks so components never import the client directly. */
export function useApi(): ChequeFlowApiClient {
  return useApp().api;
}

export function useTranslator(): Translator {
  return useApp().t;
}

export function Providers({ locale, children }: { locale: Locale; children: ReactNode }) {
  const router = useRouter();
  const storeRef = useRef<BrowserTokenStore>(null);
  storeRef.current ??= new BrowserTokenStore();

  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            retry: (failureCount, error) => {
              // Never retry an auth or validation failure — only transient ones.
              if (error instanceof ApiClientError && error.status > 0 && error.status < 500) {
                return false;
              }
              return failureCount < 2;
            },
          },
        },
      }),
  );

  const value = useMemo<AppContextValue>(
    () => ({
      api: new ChequeFlowApiClient({
        baseUrl: API_URL,
        tokenStore: storeRef.current as BrowserTokenStore,
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
