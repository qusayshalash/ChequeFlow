import AsyncStorage from '@react-native-async-storage/async-storage';
import { createAsyncStoragePersister } from '@tanstack/query-async-storage-persister';
import type { PersistQueryClientOptions } from '@tanstack/react-query-persist-client';

import { APP_VERSION } from '@/lib/config';

/**
 * What the app still knows when there is no network.
 *
 * Writing offline was already handled: a cheque photographed on a rooftop is
 * queued and sent when the server can be reached again. Reading was not. The
 * query cache lived in memory only, so an app opened without a signal showed
 * empty screens — the same cheques it had displayed a minute earlier, gone,
 * because the process had restarted in between.
 *
 * Persisting the cache fixes that at the cost of one real tradeoff, which is
 * why the rules below are what they are rather than the defaults.
 */

/**
 * How old a cached answer may be before it is discarded instead of shown.
 *
 * A day-old list is still worth seeing beside the app's offline banner: the
 * cheques, their amounts and their due dates do not change by themselves. A
 * week-old one is a different thing — long enough that someone else has acted
 * on these cheques — and silently presenting it as the ledger is worse than
 * an empty screen, which at least tells the truth.
 */
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

/**
 * The cache lands in AsyncStorage, which is world-readable on a rooted device.
 *
 * That is acceptable for what it holds — the same cheque list the screen was
 * already showing — and unacceptable for anything more, which is why the
 * session tokens stay in the secure store and why signing out wipes this. It
 * is also why nothing that failed is kept: an error is not worth the risk of
 * storing, and it would be replayed as though it had just happened.
 */
export const queryPersister = createAsyncStoragePersister({
  storage: AsyncStorage,
  key: 'chequeflow.query-cache',
  // Batches the writes: a list screen settling produces many cache updates in
  // a row, and each one would otherwise be a separate write to disk.
  throttleTime: 2_000,
});

export const persistOptions: Omit<PersistQueryClientOptions, 'queryClient'> = {
  persister: queryPersister,
  maxAge: MAX_AGE_MS,
  // A shipped version that changed a response shape must not restore the old
  // one into new screens; changing the buster drops the cache instead.
  buster: APP_VERSION,
  dehydrateOptions: {
    shouldDehydrateQuery: (query) => query.state.status === 'success',
    // A queued cheque is the draft store's business, not the cache's. Writing
    // mutations here too would give one queue two owners.
    shouldDehydrateMutation: () => false,
  },
};

/** Called when a session ends, so the next person on the phone sees nothing. */
export async function forgetCachedAnswers(): Promise<void> {
  try {
    await queryPersister.removeClient();
  } catch {
    // Storage that refuses to clear is not a reason to fail a sign-out; the
    // in-memory cache is cleared either way.
  }
}
