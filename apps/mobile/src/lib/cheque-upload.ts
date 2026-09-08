import { File } from 'expo-file-system';

import type { ChequeFlowApiClient } from '@cheque-flow/api-client';
import { ChequeDirection } from '@cheque-flow/shared-types';

/**
 * Currency stamped on a cheque that has only been photographed.
 *
 * A placeholder, not a guess: nothing has been read yet, so the cheque sits in
 * DRAFT and counts as nothing on the dashboard until a reviewer sets the real
 * currency on the next screen.
 */
const PLACEHOLDER_CURRENCY = 'USD';

export interface CapturedImage {
  side: string;
  uri: string;
}

/**
 * Turns a set of photographs into a cheque on the server.
 *
 * Shared by the live capture screen and the offline queue so both produce the
 * same thing. When this existed only inside the capture screen, the queue had
 * no way to finish the job — which is why drafts were silently stranded.
 *
 * The cheque is created with placeholder values and a temporary number: at
 * this point nothing about it has been read yet. The reviewer supplies the
 * real values on the next screen, and until they do the cheque stays in DRAFT
 * and counts as nothing on the dashboard.
 */
export async function uploadCapturedCheque(
  api: ChequeFlowApiClient,
  images: readonly CapturedImage[],
): Promise<string> {
  const today = new Date().toISOString().slice(0, 10);

  const created = await api.createCheque(
    {
      direction: ChequeDirection.INCOMING,
      chequeNumber: `TMP-${Date.now().toString().slice(-8)}`,
      amountInWords: null,
      amount: '1.00',
      currency: PLACEHOLDER_CURRENCY,
      // No rate on a placeholder: nothing about this cheque has been read yet,
      // and a rate against a placeholder amount would be a fabricated figure.
      exchangeRate: null,
      dueDate: today,
      issueDate: null,
      receivedDate: today,
      branchId: null,
      bankId: null,
      bankNameRaw: null,
      bankBranchRaw: null,
      accountNumber: null,
      drawerName: null,
      // Nothing to replace: a photographed cheque is a new record, and the
      // link to a bounced one is set later from the cheque's own screen.
      replacesChequeId: null,
      originalSourceId: null,
      originalPayeeName: null,
      currentLocationId: null,
      purpose: null,
      referenceNumber: null,
      notes: null,
    },
    // A photograph of a cheque that is already recorded is a re-photograph,
    // not a second cheque; duplicate detection runs again after review, on the
    // real values.
    true,
  );

  for (const image of images) {
    const form = new FormData();

    // A real file, not a `{ uri, name, type }` descriptor.
    //
    // That descriptor is React Native's own extension, and it worked while
    // `fetch` was the XHR-backed polyfill. Expo's WinterCG fetch replaces that
    // global, and it converts multipart bodies itself — its converter accepts a
    // string, a Blob, or anything exposing `bytes()`, and rejects everything
    // else with "Unsupported FormDataPart implementation". Its own source says
    // so plainly: "`uri` is not supported for React Native's FormData."
    //
    // The failure was invisible from the outside: the request never left the
    // device, so the API logged nothing, and the screen reported it as
    // `errors.network` — "could not reach the server", for a server that was
    // never contacted. The cheque record had already been created by then, so
    // each attempt left a TMP-numbered draft behind with no image on it.
    //
    // `expo-file-system`'s File implements Blob and carries its own name and
    // media type, which is exactly the shape the converter wants.
    form.append('file', new File(image.uri) as unknown as Blob);
    form.append('side', image.side);
    form.append('capturedAt', new Date().toISOString());
    await api.uploadChequeImage(created.cheque.id, form, true);
  }

  await api.processOcr(created.cheque.id);
  return created.cheque.id;
}
