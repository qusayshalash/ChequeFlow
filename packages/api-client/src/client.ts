import type {
  AuthTokens,
  BankView,
  BranchView,
  ChequeDetailView,
  ChequeEventView,
  ChequeImageView,
  ChequeSummaryView,
  ContactStatementView,
  ContactView,
  DashboardSummary,
  DuplicateChequeMatch,
  LocationView,
  Paginated,
  UserView,
} from '@cheque-flow/shared-types';
import type {
  BounceChequeInput,
  BulkChequeActionInput,
  RestoreBackupInput,
  CancelChequeInput,
  ClearChequeInput,
  CreateChequeBatchInput,
  CreateChequeInput,
  CreateContactInput,
  CreateReminderInput,
  CreateUserInput,
  DepositChequeInput,
  HandoverChequeInput,
  ListChequesQuery,
  ListContactsQuery,
  ListUsersQuery,
  MarkLostChequeInput,
  MergeContactsInput,
  PostponeChequeInput,
  ReceiveChequeInput,
  ReturnChequeInput,
  ReviewChequeInput,
  UpdateChequeInput,
  UpdateContactInput,
  UpdateUserInput,
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

/**
 * A count and total belonging to one currency.
 *
 * Report figures are always shaped this way: a single total across currencies
 * would be a number with no meaning, and one labelled with a single currency
 * would be actively misleading.
 */
export interface CurrencyTotal {
  currency: string;
  count: number;
  total: string;
}

export interface ReminderRow {
  id: string;
  type: string;
  channel: string;
  status: string;
  remindAt: string;
  isDue: boolean;
  custom: boolean;
  note: string | null;
  acknowledgedAt: string | null;
  cheque: {
    id: string;
    chequeNumber: string;
    amount: string;
    currency: string;
    dueDate: string;
    status: string;
    direction: string;
  };
}

/** One row of a serial batch that matched a cheque already on file. */
export interface BatchDuplicateRow {
  /** Position in the submitted batch, so the form can point at the right row. */
  index: number;
  chequeNumber: string;
  matches: DuplicateChequeMatch[];
}

export interface CreateChequeBatchResponse {
  cheques: ChequeSummaryView[];
  duplicates: BatchDuplicateRow[];
}

/** A cheque a bulk action could not be applied to, and why. */
export interface BulkActionSkip {
  chequeId: string;
  chequeNumber: string;
  /** A message key — pass it through the translator before showing it. */
  reason: string;
}

export interface BulkActionResponse {
  /**
   * `BLOCKED` means nothing was written. The selection held a cheque that
   * could not take the action, and `skipInvalid` was not set.
   */
  status: 'APPLIED' | 'BLOCKED';
  applied: ChequeSummaryView[];
  skipped: BulkActionSkip[];
}

export interface RestoreBackupResponse {
  restored: Record<string, number>;
  /** Users the archive held that already exist here, by email. */
  skippedUsers: number;
  /** Always true when users were restored: the archive holds no passwords. */
  usersNeedPasswords: boolean;
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

  /**
   * Cheap reachability check. Used to tell "the server is down" apart from
   * "this particular request failed", and deliberately unauthenticated so it
   * still answers when the session has expired.
   */
  /**
   * Downloads a complete JSON archive of the organization.
   *
   * Returned as text so the caller decides what to do with it — the browser
   * saves it, and nothing is written to a server.
   */
  exportBackup() {
    return this.requestText('/backup/export');
  }

  /**
   * Puts an archive back into an empty organization.
   *
   * Rejects with CONFLICT when the organization already holds records: there
   * is no merge, and the caller is expected to say so rather than retry.
   */
  restoreBackup(input: RestoreBackupInput) {
    return this.request<RestoreBackupResponse>('/backup/restore', {
      method: 'POST',
      body: input,
    });
  }

  /** Whether OCR, the database and storage are actually working. */
  getDiagnostics() {
    return this.request<{
      ocr: {
        state: 'ok' | 'degraded' | 'down';
        messageKey: string;
        detail?: string;
        requested: string;
        effective: string;
      };
      database: { state: 'ok' | 'degraded' | 'down'; messageKey: string };
      storage: { state: 'ok' | 'degraded' | 'down'; messageKey: string };
    }>('/diagnostics');
  }

  health() {
    return this.request<{ status: string }>('/health', { anonymous: true });
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

  /**
   * Creates a run of serial cheques in one request.
   *
   * All or nothing: on a 409 the server has written nothing, so the caller can
   * fix the offending rows and send the same batch again.
   */
  createChequeBatch(input: CreateChequeBatchInput, allowDuplicate = false) {
    return this.request<CreateChequeBatchResponse>('/cheques/batch', {
      method: 'POST',
      body: input,
      query: { allowDuplicate },
    });
  }

  /**
   * Applies one lifecycle action to a selection of cheques.
   *
   * Resolves rather than throwing when the selection is refused: read
   * `status` — `BLOCKED` means nothing was written and `skipped` says which
   * cheque stopped it.
   */
  bulkChequeAction(input: BulkChequeActionInput) {
    return this.request<BulkActionResponse>('/cheques/bulk-action', {
      method: 'POST',
      body: input,
    });
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

  getContactStatement(id: string) {
    return this.request<ContactStatementView>(`/contacts/${id}/statement`);
  }

  deleteContact(id: string) {
    return this.request<{ deleted: boolean; contact: ContactView | null }>(`/contacts/${id}`, {
      method: 'DELETE',
    });
  }

  mergeContacts(input: MergeContactsInput) {
    return this.request<ContactView>('/contacts/merge', { method: 'POST', body: input });
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

  /** `dueFrom`/`dueTo` scope which cheques the figures describe. */
  getDashboard(query: { dueFrom?: string; dueTo?: string } = {}) {
    return this.request<DashboardSummary>('/dashboard', { query });
  }

  /**
   * `includeOverdue` defaults to true on the server, which folds every past-due
   * cheque in regardless of the window. That is right for a chasing list and
   * wrong for "what falls in these dates", so callers asking a date question
   * pass false.
   */
  getDueReport(
    query: {
      withinDays?: number;
      from?: string;
      to?: string;
      includeOverdue?: boolean;
    } = {},
  ) {
    return this.request<{
      from: string;
      to: string;
      /** Counts are safe to add across currencies; money is not. */
      count: number;
      overdueCount: number;
      byCurrency: CurrencyTotal[];
      overdueByCurrency: CurrencyTotal[];
      cheques: ChequeSummaryView[];
    }>('/reports/due', { query });
  }

  getCashFlowReport(query: { from: string; to: string; granularity?: 'day' | 'week' | 'month' }) {
    return this.request<{
      from: string;
      to: string;
      granularity: string;
      periods: Array<{
        period: string;
        byCurrency: Array<{
          currency: string;
          inflow: string;
          outflow: string;
          net: string;
        }>;
      }>;
    }>('/reports/cash-flow', { query });
  }

  getCustodyReport(query: { branchId?: string; locationId?: string; holderId?: string } = {}) {
    return this.request<{
      entries: Array<{
        locationName: string | null;
        holderName: string | null;
        count: number;
        byCurrency: CurrencyTotal[];
      }>;
      count: number;
      byCurrency: CurrencyTotal[];
    }>('/reports/custody', { query });
  }

  listNotifications(limit = 50) {
    return this.request<{ data: ReminderRow[] }>('/notifications', { query: { limit } });
  }

  snoozeReminder(id: string, minutes: number) {
    return this.request<ReminderRow>(`/notifications/${id}/snooze`, {
      method: 'POST',
      body: { minutes },
    });
  }

  acknowledgeReminder(id: string) {
    return this.request<{ acknowledged: boolean }>(`/notifications/${id}/acknowledge`, {
      method: 'POST',
    });
  }

  createChequeReminder(chequeId: string, input: CreateReminderInput) {
    return this.request<{ id: string }>(`/cheques/${chequeId}/reminders`, {
      method: 'POST',
      body: input,
    });
  }

  // ── users ─────────────────────────────────────────────────────────────────

  listUsers(query: Partial<ListUsersQuery> = {}) {
    return this.request<Paginated<UserView>>('/users', { query });
  }

  listRoles() {
    return this.request<{ data: string[] }>('/users/roles');
  }

  createUser(input: CreateUserInput) {
    return this.request<UserView>('/users', { method: 'POST', body: input });
  }

  updateUser(id: string, input: UpdateUserInput) {
    return this.request<UserView>(`/users/${id}`, { method: 'PATCH', body: input });
  }

  // ── export ────────────────────────────────────────────────────────────────

  /**
   * Downloads the filtered cheque list as CSV text.
   *
   * Returns the document itself rather than a URL: the caller decides whether
   * to write it to a file, share it, or hand it to a spreadsheet app.
   */
  exportChequesCsv(query: Partial<ListChequesQuery> = {}, locale?: string) {
    return this.requestText('/cheques/export', {
      query: { ...query, ...(locale ? { locale } : {}) },
    });
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

  /**
   * Like {@link request}, but for endpoints that return a document rather than
   * JSON (currently CSV). Shares the same auth and refresh handling; only the
   * response parsing differs.
   */
  private async requestText(path: string, options: RequestOptions = {}): Promise<string> {
    let response = await this.send(path, options);

    if (response.status === 401 && !options.anonymous) {
      const refreshed = await this.refreshTokens();
      if (refreshed) {
        response = await this.send(path, options);
      } else {
        await this.tokenStore.setTokens(null);
        this.onSessionExpired?.();
      }
    }

    const text = await response.text();
    if (!response.ok) {
      // An error body is still JSON even on a CSV endpoint.
      let payload: unknown = null;
      try {
        payload = JSON.parse(text);
      } catch {
        payload = null;
      }
      throw ApiClientError.fromResponse(
        response.status,
        payload,
        response.headers.get('x-request-id'),
      );
    }
    return text;
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
