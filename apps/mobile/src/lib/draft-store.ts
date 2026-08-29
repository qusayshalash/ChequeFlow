import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'chequeflow.drafts';
const MAX_DRAFTS = 20;

/**
 * Offline capture drafts.
 *
 * Only local file URIs and a timestamp are stored — never amounts, names,
 * account numbers or tokens, so an unencrypted store holds nothing sensitive.
 */
export interface CaptureDraft {
  createdAt: string;
  images: Array<{ side: string; uri: string }>;
}

export async function listDrafts(): Promise<CaptureDraft[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as CaptureDraft[]) : [];
  } catch {
    return [];
  }
}

export async function saveDraft(draft: CaptureDraft): Promise<void> {
  try {
    const drafts = await listDrafts();
    const next = [draft, ...drafts].slice(0, MAX_DRAFTS);
    await AsyncStorage.setItem(KEY, JSON.stringify(next));
  } catch {
    // Losing a draft must never crash the capture flow.
  }
}

export async function clearDrafts(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Ignore: the next write overwrites the list anyway.
  }
}
