import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';

import { ApiClientError, ChequeFlowApiClient } from '@cheque-flow/api-client';
import {
  createTranslator,
  formatDate as formatDateRaw,
  formatDateTime as formatDateTimeRaw,
  formatDueDistance as formatDueDistanceRaw,
  formatMoney as formatMoneyRaw,
  type CalendarPreference,
  type Locale,
  type Translator,
} from '@cheque-flow/localization';

import { API_URL, defaultLocale } from '@/lib/config';
import { DEFAULT_SETTINGS, loadSettings, saveSettings, type AppSettings } from '@/lib/app-settings';
import { SecureTokenStore } from '@/lib/secure-token-store';

/** How often the app re-checks whether the API is reachable. */
const CONNECTIVITY_INTERVAL_MS = 20_000;

interface AppContextValue {
  api: ChequeFlowApiClient;
  locale: Locale;
  calendar: CalendarPreference;
  t: Translator;
  /** True once the stored preferences have been read. */
  ready: boolean;
  online: boolean;
  checkConnection: () => Promise<boolean>;
  setLocale: (locale: Locale) => void;
  setCalendar: (calendar: CalendarPreference) => void;
  /** Formatters bound to the current preferences, so screens never pass them. */
  money: (amount: string, currency: string) => string;
  date: (isoDate: string) => string;
  dateTime: (isoDateTime: string) => string;
  dueDistance: (isoDate: string, today: string) => string;
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

  // The build-time default is only a starting point; the stored choice wins
  // as soon as it has been read.
  const [settings, setSettings] = useState<AppSettings>({
    ...DEFAULT_SETTINGS,
    locale: defaultLocale(),
  });
  const [ready, setReady] = useState(false);
  const [online, setOnline] = useState(true);

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

  const api = useMemo(
    () =>
      new ChequeFlowApiClient({
        baseUrl: API_URL,
        tokenStore: storeRef.current as SecureTokenStore,
        onSessionExpired: () => {
          queryClient.clear();
          router.replace('/login');
        },
      }),
    [queryClient, router],
  );

  useEffect(() => {
    void (async () => {
      setSettings(await loadSettings());
      setReady(true);
    })();
  }, []);

  /**
   * Connectivity is measured, not guessed: the app asks the API whether it can
   * be reached. That is what the user actually cares about — a phone with full
   * signal but an unreachable server is offline as far as the work goes.
   */
  const checkConnection = useCallback(async (): Promise<boolean> => {
    try {
      await api.health();
      setOnline(true);
      onlineManager.setOnline(true);
      return true;
    } catch {
      setOnline(false);
      onlineManager.setOnline(false);
      return false;
    }
  }, [api]);

  useEffect(() => {
    void checkConnection();
    const timer = setInterval(() => void checkConnection(), CONNECTIVITY_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [checkConnection]);

  const setLocale = useCallback((locale: Locale) => {
    setSettings((current) => {
      const next = { ...current, locale };
      void saveSettings(next);
      return next;
    });
  }, []);

  const setCalendar = useCallback((calendar: CalendarPreference) => {
    setSettings((current) => {
      const next = { ...current, calendar };
      void saveSettings(next);
      return next;
    });
  }, []);

  const value = useMemo<AppContextValue>(() => {
    const { locale, calendar } = settings;
    return {
      api,
      locale,
      calendar,
      t: createTranslator(locale),
      ready,
      online,
      checkConnection,
      setLocale,
      setCalendar,
      money: (amount, currency) => formatMoneyRaw(locale, amount, currency),
      date: (isoDate) => formatDateRaw(locale, isoDate, calendar),
      dateTime: (isoDateTime) => formatDateTimeRaw(locale, isoDateTime, { calendar }),
      dueDistance: (isoDate, today) => formatDueDistanceRaw(locale, isoDate, today),
    };
  }, [api, settings, ready, online, checkConnection, setLocale, setCalendar]);

  return (
    <QueryClientProvider client={queryClient}>
      <AppContext.Provider value={value}>{children}</AppContext.Provider>
    </QueryClientProvider>
  );
}
