import * as FileSystem from 'expo-file-system';

import { ApiClientError, type ChequeFlowApiClient } from '@cheque-flow/api-client';

import { uploadCapturedCheque } from '@/lib/cheque-upload';
import { listDrafts, markDraftFailed, removeDraft, type CaptureDraft } from '@/lib/draft-store';

/**
 * How many times a draft is retried before it stops being retried silently.
 *
 * After this it stays in the queue and is surfaced to the user with its error,
 * rather than being retried forever in the background or dropped without a
 * word. A cheque is worth a person's attention.
 */
const MAX_ATTEMPTS = 5;

export interface SyncResult {
  uploaded: number;
  failed: number;
  /** Drafts abandoned because their photographs are no longer on the device. */
  lost: number;
  remaining: number;
}

/**
 * Whether the photographs a draft points at still exist.
 *
 * Captures live in the app's cache directory, which the operating system may
 * clear whenever it wants space. A draft whose files are gone can never be
 * uploaded, so it is removed and counted rather than retried forever.
 */
async function imagesStillExist(draft: CaptureDraft): Promise<boolean> {
  for (const image of draft.images) {
    try {
      if (!new FileSystem.File(image.uri).exists) return false;
    } catch {
      return false;
    }
  }
  return draft.images.length > 0;
}

/**
 * Uploads everything captured while the device was offline.
 *
 * Drafts are processed oldest first so cheques reach the server in the order
 * they were taken, and each is removed only after the server has accepted it.
 * A failure stops the run: if the network is down, trying the rest just burns
 * battery and inflates every draft's attempt count for the same reason.
 */
export async function syncDrafts(api: ChequeFlowApiClient): Promise<SyncResult> {
  const drafts = (await listDrafts()).slice().reverse();
  const result: SyncResult = { uploaded: 0, failed: 0, lost: 0, remaining: 0 };

  for (const draft of drafts) {
    if (draft.attempts >= MAX_ATTEMPTS) continue;

    if (!(await imagesStillExist(draft))) {
      await removeDraft(draft.id);
      result.lost += 1;
      continue;
    }

    try {
      await uploadCapturedCheque(api, draft.images);
      await removeDraft(draft.id);
      result.uploaded += 1;
    } catch (error) {
      const reason = error instanceof ApiClientError ? error.messageKey : 'errors.network';
      await markDraftFailed(draft.id, reason);
      result.failed += 1;
      // Stop on the first failure; the rest will fail for the same reason.
      break;
    }
  }

  result.remaining = (await listDrafts()).length;
  return result;
}
