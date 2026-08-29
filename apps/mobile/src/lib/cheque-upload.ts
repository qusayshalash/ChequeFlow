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
      dueDate: today,
      issueDate: null,
      receivedDate: today,
      branchId: null,
      bankId: null,
      bankNameRaw: null,
      bankBranchRaw: null,
      accountNumber: null,
      drawerName: null,
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
    // React Native's FormData accepts this file descriptor shape.
    form.append('file', {
      uri: image.uri,
      name: `${image.side.toLowerCase()}.jpg`,
      type: 'image/jpeg',
    } as unknown as Blob);
    form.append('side', image.side);
    form.append('capturedAt', new Date().toISOString());
    await api.uploadChequeImage(created.cheque.id, form, true);
  }

  await api.processOcr(created.cheque.id);
  return created.cheque.id;
}
