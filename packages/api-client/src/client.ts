import type {
  AuthTokens,
  BankView,
  BranchView,
  ChequeDetailView,
  ChequeEventView,
  ChequeImageView,
  ChequeSummaryView,
  ContactView,
  DashboardSummary,
  DuplicateChequeMatch,
  LocationView,
  Paginated,
} from '@cheque-flow/shared-types';
import type {
  BounceChequeInput,
  CancelChequeInput,
  ClearChequeInput,
  CreateChequeInput,
  CreateContactInput,
  DepositChequeInput,
  HandoverChequeInput,
  ListChequesQuery,
  ListContactsQuery,
  MarkLostChequeInput,
  PostponeChequeInput,
  ReceiveChequeInput,
  ReturnChequeInput,
  ReviewChequeInput,
  UpdateChequeInput,
  UpdateContactInput,
} from '@cheque-flow/validation';

import { ApiClientError } from './errors.js';
import { MemoryTokenStore, type TokenStore } from './token-store.js';

export interface ApiClientOptions {
  baseUrl: string;
  tokenStore?: TokenStore;
  /** Injected for tests and for React Native's fetch. */
  fetchImpl?: typeof fetch;
  /** Called when refreshing fails and the user has to sign in again. */
  onSessionExpired?: () => void;
}

type QueryValue = string | number | boolean | undefined | null | string[];

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, QueryValue>;
  /** Skip the access token (login, refresh). */
  anonymous?: boolean;
  signal?: AbortSignal;
  /** Multipart payload; `body` is ignored when set. */
  formData?: FormData;
}

export interface OcrSuggestionResponse {
  extractionId: string;
  provider: string;
  status: string;
  overallConfidence: number;
  fields: Record<string, { value: unknown; confidence: number; rawText?: string }>;
  lowConfidenceFields: string[];
  threshold: number;
}

/**
 * Typed client for the ChequeFlow API.
 *
 * Handles bearer tokens, one automatic refresh-and-retry per request, and
 * turns every error into an {@link ApiClientError}.
 */
export class ChequeFlowApiClient {
  private readonly baseUrl: string;
  private readonly tokenStore: TokenStore;
  private readonly fetchImpl: typeof fetch;
  private readonly onSessionExpired: (() => void) | undefined;
  /** Ensures concurrent 401s trigger a single refresh. */
  private refreshInFlight: Promise<AuthTokens | null> | null = null;

  constructor(options: ApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, '');
    this.tokenStore = options.tokenStore ?? new MemoryTokenStore();
    this.fetchImpl = options.fetchImpl ?? globalThis.fetch.bind(globalThis);
    this.onSessionExpired = options.onSessionExpired;
  }

  // ── auth ──────────────────────────────────────────────────────────────────

  async login(email: string, password: string): Promise<AuthTokens> {
    const tokens = await this.request<AuthTokens>('/auth/login', {
      method: 'POST',
      body: { email, password },
      anonymous: true,
    });
    await this.tokenStore.setTokens(tokens);
    return tokens;
  }

  async logout(allDevices = false): Promise<void> {
    const tokens = await this.tokenStore.getTokens();
    try {
      await this.request<void>('/auth/logout', {
        method: 'POST',
        body: { refreshToken: tokens?.refreshToken, allDevices },
      });
    } finally {
      // The local session is cleared even when the server call fails.
      await this.tokenStore.setTokens(null);
    }
  }

  me() {
    return this.request<{
      id: string;
      organizationId: string;
      branchId: string | null;
      name: string;
      email: string;
      roles: string[];
      permissions: string[];
    }>('/auth/me');
  }

  // ── cheques ───────────────────────────────────────────────────────────────

  listCheques(query: Partial<ListChequesQuery> = {}) {
    return this.request<Paginated<ChequeSummaryView>>('/cheques', {
      query: query,
    });
  }

  getCheque(id: string) {
    return this.request<ChequeDetailView>(`/cheques/${id}`);
  }

  createCheque(input: CreateChequeInput, allowDuplicate = false) {
    return this.request<{ cheque: ChequeDetailView; duplicates: DuplicateChequeMatch[] }>(
      '/cheques',
      { method: 'POST', body: input, query: { allowDuplicate } },
    );
  }

  updateCheque(id: string, input: UpdateChequeInput) {
    return this.request<ChequeDetailView>(`/cheques/${id}`, { method: 'PATCH', body: input });
  }

  listChequeEvents(id: string) {
    return this.request<{ data: ChequeEventView[] }>(`/cheques/${id}/events`);
  }

  // ── images and OCR ────────────────────────────────────────────────────────

  uploadChequeImage(id: string, formData: FormData, allowDuplicate = false) {
    return this.request<{ image: ChequeImageView; duplicates: DuplicateChequeMatch[] }>(
      `/cheques/${id}/images`,
      { method: 'POST', formData, query: { allowDuplicate } },
    );
  }

  listChequeImages(id: string) {
    return this.request<ChequeImageView[]>(`/cheques/${id}/images`);
  }

  getChequeImageUrl(chequeId: string, imageId: string) {
    return this.request<{ url: string; expiresIn: number }>(
      `/cheques/${chequeId}/images/${imageId}/url`,
    );
  }

  processOcr(id: string) {
    return this.request<OcrSuggestionResponse>(`/cheques/${id}/process-ocr`, { method: 'POST' });
  }

  getOcrSuggestion(id: string) {
    return this.request<OcrSuggestionResponse | null>(`/cheques/${id}/ocr-suggestion`);
  }

  reviewCheque(id: string, input: ReviewChequeInput) {
    return this.request<ChequeDetailView>(`/cheques/${id}/review`, { method: 'POST', body: input });
  }

  // ── lifecycle actions ─────────────────────────────────────────────────────

  receiveCheque(id: string, input: ReceiveChequeInput) {
    return this.action(id, 'receive', input);
  }

  handoverCheque(id: string, input: HandoverChequeInput) {
    return this.action(id, 'handover', input);
  }

  depositCheque(id: string, input: DepositChequeInput) {
    return this.action(id, 'deposit', input);
  }

  clearCheque(id: string, input: ClearChequeInput) {
    return this.action(id, 'clear', input);
  }

  bounceCheque(id: string, input: BounceChequeInput) {
    return this.action(id, 'bounce', input);
  }

  returnCheque(id: string, input: ReturnChequeInput) {
    return this.action(id, 'return', input);
  }

  postponeCheque(id: string, input: PostponeChequeInput) {
    return this.action(id, 'postpone', input);
  }

  cancelCheque(id: string, input: CancelChequeInput) {
    return this.action(id, 'cancel', input);
  }

  markChequeLost(id: string, input: MarkLostChequeInput) {
    return this.action(id, 'mark-lost', input);
  }

  private action(id: string, path: string, body: unknown) {
    return this.request<ChequeDetailView>(`/cheques/${id}/${path}`, { method: 'POST', body });
  }

  // ── contacts and reference data ───────────────────────────────────────────

  listContacts(query: Partial<ListContactsQuery> = {}) {
    return this.request<Paginated<ContactView>>('/contacts', {
      query: query,
    });
  }

  getContact(id: string) {
    return this.request<ContactView>(`/contacts/${id}`);
  }

  createContact(input: CreateContactInput) {
    return this.request<ContactView>('/contacts', { method: 'POST', body: input });
  }

  updateContact(id: string, input: UpdateContactInput) {
    return this.request<ContactView>(`/contacts/${id}`, { method: 'PATCH', body: input });
  }

  listBranches() {
    return this.request<BranchView[]>('/branches');
  }

  listBanks(country?: string) {
    return this.request<BankView[]>('/banks', { query: { country } });
  }

  listLocations(branchId?: string) {
    return this.request<LocationView[]>('/locations', { query: { branchId } });
  }

  // ── dashboards and reports ────────────────────────────────────────────────

  getDashboard() {
    return this.request<DashboardSummary>('/dashboard');
  }

  getDueReport(query: { withinDays?: number; from?: string; to?: string } = {}) {
    return this.request<{
      from: string;
      to: string;
      count: number;
      total: string;
      overdueCount: number;
      overdueTotal: string;
      cheques: ChequeSummaryView[];
    }>('/reports/due', { query });
  }

  getCashFlowReport(query: { from: string; to: string; granularity?: 'day' | 'week' | 'month' }) {
    return this.request<{
      from: string;
      to: string;
      granularity: string;
      periods: Array<{ period: string; inflow: string; outflow: string; net: string }>;
    }>('/reports/cash-flow', { query });
  }

  getCustodyReport(query: { branchId?: string; locationId?: string; holderId?: string } = {}) {
    return this.request<{
      entries: Array<{
        locationName: string | null;
        holderName: string | null;
        count: number;
        total: string;
      }>;
      count: number;
      total: string;
    }>('/reports/custody', { query });
  }

  listNotifications(limit = 50) {
    return this.request<{ data: unknown[] }>('/notifications', { query: { limit } });
  }

  // ── transport ─────────────────────────────────────────────────────────────

  private buildUrl(path: string, query?: Record<string, QueryValue>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    for (const [key, value] of Object.entries(query ?? {})) {
      if (value === undefined || value === null || value === '') continue;
      if (Array.isArray(value)) {
        for (const item of value) url.searchParams.append(key, item);
      } else {
        url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const response = await this.send(path, options);

    // One transparent refresh-and-retry on an expired access token.
    if (response.status === 401 && !options.anonymous) {
      const refreshed = await this.refreshTokens();
      if (refreshed) {
        return this.parse<T>(await this.send(path, options));
      }
      await this.tokenStore.setTokens(null);
      this.onSessionExpired?.();
    }

    return this.parse<T>(response);
  }

  private async send(path: string, options: RequestOptions): Promise<Response> {
    const tokens = options.anonymous ? null : await this.tokenStore.getTokens();
    const headers: Record<string, string> = {};
    if (tokens?.accessToken) headers.Authorization = `Bearer ${tokens.accessToken}`;

    let body: BodyInit | undefined;
    if (options.formData) {
      // Let the runtime set the multipart boundary.
      body = options.formData;
    } else if (options.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(options.body);
    }

    try {
      return await this.fetchImpl(this.buildUrl(path, options.query), {
        method: options.method ?? 'GET',
        headers,
        ...(body === undefined ? {} : { body }),
        ...(options.signal ? { signal: options.signal } : {}),
      });
    } catch (error) {
      throw ApiClientError.network(error);
    }
  }

  private async parse<T>(response: Response): Promise<T> {
    const requestId = response.headers.get('x-request-id');

    if (response.status === 204) return undefined as T;

    let payload: unknown = null;
    const text = await response.text();
    if (text.length > 0) {
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
    }

    if (!response.ok) {
      throw ApiClientError.fromResponse(response.status, payload, requestId);
    }
    return payload as T;
  }

  private refreshTokens(): Promise<AuthTokens | null> {
    // Collapse concurrent refreshes into one network call.
    this.refreshInFlight ??= (async () => {
      try {
        const current = await this.tokenStore.getTokens();
        if (!current?.refreshToken) return null;
        const tokens = await this.request<AuthTokens>('/auth/refresh', {
          method: 'POST',
          body: { refreshToken: current.refreshToken },
          anonymous: true,
        });
        await this.tokenStore.setTokens(tokens);
        return tokens;
      } catch {
        return null;
      } finally {
        this.refreshInFlight = null;
      }
    })();

    return this.refreshInFlight;
  }
}
