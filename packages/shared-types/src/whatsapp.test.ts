import { describe, expect, it } from 'vitest';

import { toWhatsAppNumber, whatsAppLink } from './whatsapp.js';

describe('toWhatsAppNumber', () => {
  it('expands a local Palestinian number with the country code', () => {
    expect(toWhatsAppNumber('0599123456')).toBe('970599123456');
    expect(toWhatsAppNumber('059 912 3456')).toBe('970599123456');
    expect(toWhatsAppNumber('059-912-3456')).toBe('970599123456');
  });

  it('accepts the other network code when the organization uses it', () => {
    expect(toWhatsAppNumber('0599123456', '972')).toBe('972599123456');
  });

  it('leaves an international number alone', () => {
    expect(toWhatsAppNumber('+970599123456')).toBe('970599123456');
    expect(toWhatsAppNumber('00970599123456')).toBe('970599123456');
    expect(toWhatsAppNumber('970599123456')).toBe('970599123456');
  });

  it('reads Arabic-Indic digits, which is how numbers arrive from a contact list', () => {
    expect(toWhatsAppNumber('٠٥٩٩١٢٣٤٥٦')).toBe('970599123456');
  });

  it('refuses anything it cannot be sure about', () => {
    // A disabled button with a reason beats a chat opened with a stranger.
    expect(toWhatsAppNumber(null)).toBeNull();
    expect(toWhatsAppNumber('')).toBeNull();
    expect(toWhatsAppNumber('  ')).toBeNull();
    expect(toWhatsAppNumber('12345')).toBeNull();
    expect(toWhatsAppNumber('لا يوجد')).toBeNull();
    expect(toWhatsAppNumber('012345678901234567')).toBeNull();
  });

  it('rejects a run of zeros, however long', () => {
    // Somebody's way past a required field, not a number — and it passes every
    // length check, so it has to be caught by shape.
    expect(toWhatsAppNumber('0000000000')).toBeNull();
    expect(toWhatsAppNumber('000')).toBeNull();
    expect(toWhatsAppNumber('+970000000000')).toBeNull();
  });

  it('handles a landline the same way, area code and all', () => {
    // 02-2951234 → trunk zero dropped, country code prefixed: 970 2 2951234.
    expect(toWhatsAppNumber('02-2951234')).toBe('97022951234');
  });
});

describe('whatsAppLink', () => {
  it('builds a link with the message already typed', () => {
    const link = whatsAppLink('0599123456', 'تذكير بشيك 200001');
    expect(link).toBe(`https://wa.me/970599123456?text=${encodeURIComponent('تذكير بشيك 200001')}`);
  });

  it('encodes newlines and Arabic without mangling them', () => {
    const link = whatsAppLink('0599123456', 'سطر\nسطر آخر');
    expect(link).toContain('%0A');
    expect(decodeURIComponent(link!.split('text=')[1]!)).toBe('سطر\nسطر آخر');
  });

  it('returns null rather than a broken link when the number is unusable', () => {
    expect(whatsAppLink(null, 'x')).toBeNull();
    expect(whatsAppLink('123', 'x')).toBeNull();
  });
});
