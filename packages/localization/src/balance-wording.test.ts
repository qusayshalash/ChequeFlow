import { describe, expect, it } from 'vitest';

import ar from './messages/ar.json';

/**
 * Which side of a balance a contact is on.
 *
 * "owesUs" read «له علينا» and "weOwe" «علينا له»: the same two words in either
 * order, and both say *we* owe *them*. A contact whose cheques we were still
 * holding showed as someone we owed, which is the opposite of the ledger.
 */
const words = (text: string) => text.split(/\s+/).sort().join(' ');

describe('balance wording in Arabic', () => {
  it('says the two directions in different words, not one phrase reordered', () => {
    expect(words(ar.contact.owesUs)).not.toBe(words(ar.contact.weOwe));
  });

  it('puts the debt on them when they owe us', () => {
    expect(ar.contact.owesUs).toBe('لنا عليه');
    expect(ar.contact.weOwe).toBe('علينا له');
  });
});
