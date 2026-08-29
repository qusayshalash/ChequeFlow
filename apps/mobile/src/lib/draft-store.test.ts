import { beforeEach, describe, expect, it, vi } from 'vitest';

// A minimal in-memory stand-in for AsyncStorage, so the queue logic is tested
// without a native module.
const store = new Map<string, string>();
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: {
    getItem: (key: string) => Promise.resolve(store.get(key) ?? null),
    setItem: (key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    },
    removeItem: (key: string) => {
      store.delete(key);
      return Promise.resolve();
    },
  },
}));

const { clearDrafts, listDrafts, markDraftFailed, removeDraft, saveDraft } =
  await import('./draft-store');

const image = { side: 'FRONT', uri: 'file:///tmp/front.jpg' };

describe('draft queue', () => {
  beforeEach(() => {
    store.clear();
  });

  it('starts empty', async () => {
    expect(await listDrafts()).toEqual([]);
  });

  it('gives every draft its own id so one can be removed alone', async () => {
    await saveDraft({ createdAt: '2026-08-29T10:00:00.000Z', images: [image] });
    await saveDraft({ createdAt: '2026-08-29T11:00:00.000Z', images: [image] });

    const drafts = await listDrafts();
    expect(drafts).toHaveLength(2);
    expect(new Set(drafts.map((draft) => draft.id)).size).toBe(2);

    await removeDraft(drafts[0]!.id);
    const remaining = await listDrafts();
    expect(remaining).toHaveLength(1);
    expect(remaining[0]!.id).toBe(drafts[1]!.id);
  });

  it('counts failures and keeps the reason', async () => {
    await saveDraft({ createdAt: '2026-08-29T10:00:00.000Z', images: [image] });
    const [draft] = await listDrafts();

    await markDraftFailed(draft!.id, 'errors.network');
    await markDraftFailed(draft!.id, 'errors.network');

    const [updated] = await listDrafts();
    expect(updated!.attempts).toBe(2);
    expect(updated!.lastError).toBe('errors.network');
  });

  it('adopts drafts written by an older build instead of dropping them', async () => {
    // The previous format had no id and no attempt count. Those captures are
    // work the user believes is saved, so they must survive the upgrade.
    store.set(
      'chequeflow.drafts',
      JSON.stringify([{ createdAt: '2026-08-01T09:00:00.000Z', images: [image] }]),
    );

    const drafts = await listDrafts();
    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.id).toBeTruthy();
    expect(drafts[0]!.attempts).toBe(0);
  });

  it('survives a corrupt store rather than crashing the app', async () => {
    store.set('chequeflow.drafts', 'not json at all');
    expect(await listDrafts()).toEqual([]);
  });

  it('ignores entries with no images', async () => {
    store.set('chequeflow.drafts', JSON.stringify([{ createdAt: 'x' }, 42, null]));
    expect(await listDrafts()).toEqual([]);
  });

  it('clears everything when asked', async () => {
    await saveDraft({ createdAt: '2026-08-29T10:00:00.000Z', images: [image] });
    await clearDrafts();
    expect(await listDrafts()).toEqual([]);
  });
});
