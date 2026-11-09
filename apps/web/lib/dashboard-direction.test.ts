import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * The headline card shows one side at a time, incoming by default.
 *
 * Both sides on the card as two labelled lines broke its design; the owner
 * asked for incoming by default with outgoing chosen from the options.
 */
const read = (path: string) => readFileSync(join(__dirname, '..', path), 'utf8');

describe('the headline card', () => {
  const page = read('app/(app)/dashboard/page.tsx');

  it('starts on incoming cheques', () => {
    expect(page).toMatch(/useState<'incoming' \| 'outgoing'>\('incoming'\)/);
  });

  it('keeps the single amount line', () => {
    expect(page).toMatch(/amount=\{\s*headline\[direction\]\.amounts/);
    expect(page).not.toMatch(/breakdown=/);
  });

  it("switches from the card's own menu, not a control above the cards", () => {
    expect(page).toMatch(/menu=\{\{[\s\S]*?chooseDirection\('outgoing'\)/);
    expect(page).not.toMatch(/aria-label=\{t\('cheque\.direction'\)\}/);
    const card = read('components/stat-card.tsx');
    // The menu is not nested in the link, or clicking it would follow it.
    expect(card).toMatch(/<Link href=\{href\} aria-label=\{label\} className="absolute inset-0/);
  });

  it('opens the list on the same side', () => {
    expect(page).toMatch(/'\/cheques\?tab=INCOMING' : '\/cheques\?tab=OUTGOING'/);
    expect(read('app/(app)/cheques/page.tsx')).toMatch(/searchParams\.get\('tab'\)/);
  });
});
