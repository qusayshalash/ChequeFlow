import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'chequeflow.drafts';
const MAX_DRAFTS = 20;

/**
 * Offline capture drafts.
 *
 * Only local file URIs and a timestamp are stored — never amounts, names,
 * account numbers or tokens, so an unencrypted store holds nothing sensitive.
 *
 * Each draft carries an `id` so one can be removed after it uploads without
 * discarding the others: a queue you can only empty wholesale is not a queue.
 */
export interface CaptureDraft {
  id: string;
  createdAt: string;
  images: Array<{ side: string; uri: string }>;
  /** Incremented each time a sync attempt fails, for the giving-up rule. */
  attempts: number;
  /** Why the last attempt failed, shown to the user rather than swallowed. */
  lastError?: string;
}

export async function listDrafts(): Promise<CaptureDraft[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (!raw) return [];

    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];

    // Drafts written by an older build have no id or attempt count; give them
    // one rather than dropping work the user already believes is saved.
    return parsed.flatMap((entry): CaptureDraft[] => {
      if (typeof entry !== 'object' || entry === null) return [];
      const record = entry as Record<string, unknown>;
      if (!Array.isArray(record.images)) return [];
      return [
        {
          id: typeof record.id === 'string' ? record.id : `legacy-${String(record.createdAt)}`,
          createdAt:
            typeof record.createdAt === 'string' ? record.createdAt : new Date().toISOString(),
          images: record.images as CaptureDraft['images'],
          attempts: typeof record.attempts === 'number' ? record.attempts : 0,
          ...(typeof record.lastError === 'string' ? { lastError: record.lastError } : {}),
        },
      ];
    });
  } catch {
    return [];
  }
}

async function write(drafts: CaptureDraft[]): Promise<void> {
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(drafts.slice(0, MAX_DRAFTS)));
  } catch {
    // Losing a draft must never crash the capture flow.
  }
}

export async function saveDraft(
  draft: Omit<CaptureDraft, 'id' | 'attempts'> & { id?: string },
): Promise<void> {
  const drafts = await listDrafts();
  await write([
    {
      id: draft.id ?? `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      createdAt: draft.createdAt,
      images: draft.images,
      attempts: 0,
    },
    ...drafts,
  ]);
}

export async function removeDraft(id: string): Promise<void> {
  const drafts = await listDrafts();
  await write(drafts.filter((draft) => draft.id !== id));
}

/** Records a failed attempt so the UI can show why, and stop retrying forever. */
export async function markDraftFailed(id: string, reason: string): Promise<void> {
  const drafts = await listDrafts();
  await write(
    drafts.map((draft) =>
      draft.id === id ? { ...draft, attempts: draft.attempts + 1, lastError: reason } : draft,
    ),
  );
}

export async function clearDrafts(): Promise<void> {
  try {
    await AsyncStorage.removeItem(KEY);
  } catch {
    // Ignore: the next write overwrites the list anyway.
  }
}
