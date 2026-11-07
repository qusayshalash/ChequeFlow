import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * With reading off, the dashboard offers no button that can only fail.
 *
 * `ocr.run` was the one thing the panel showed for a cheque with no suggestion,
 * so a manually entered draft on such a server would have offered it every time.
 */
const read = (path: string) => readFileSync(join(__dirname, '..', path), 'utf8');

describe('the review panel with reading turned off', () => {
  const panel = read('components/ocr-review.tsx');

  it('renders nothing for a cheque with no suggestion', () => {
    expect(panel).toMatch(/if \(ocrOff\) return null;\s+return \(\s+<Card/);
  });

  it('does not offer to read again', () => {
    expect(panel).toMatch(/ocrOff \? null : \(\s+<Button[\s\S]*?t\('common\.retry'\)/);
  });
});

describe('the review queue with reading turned off', () => {
  it('does not call hand-entered values automatic suggestions', () => {
    const page = read('app/(app)/cheques/review/page.tsx');
    expect(page).toMatch(/ocrOff \? null : \(\s+<Card[\s\S]*?ocr\.suggestionNotice/);
  });
});

describe('the actions panel', () => {
  it('offers no action it has no way to run', () => {
    const panel = read('components/cheque-actions.tsx');
    expect(panel).toMatch(
      /name !== ChequeAction\.REVIEW && name !== ChequeAction\.SUBMIT_FOR_REVIEW/,
    );
  });
});
