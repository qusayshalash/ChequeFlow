import { detectMimeType, extensionFor, isAllowedUploadType } from './file-signature';

const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
const webp = Buffer.concat([
  Buffer.from('RIFF'),
  Buffer.from([0x24, 0x00, 0x00, 0x00]),
  Buffer.from('WEBPVP8 '),
]);
const pdf = Buffer.from('%PDF-1.7\n');

describe('detectMimeType', () => {
  it('recognises the allowed formats from their magic bytes', () => {
    expect(detectMimeType(jpeg)).toBe('image/jpeg');
    expect(detectMimeType(png)).toBe('image/png');
    expect(detectMimeType(webp)).toBe('image/webp');
    expect(detectMimeType(pdf)).toBe('application/pdf');
  });

  it('rejects content that only claims to be an image', () => {
    // A PHP web shell renamed to cheque.jpg — the extension lies, bytes do not.
    const shell = Buffer.from('<?php system($_GET["c"]); ?>');
    expect(detectMimeType(shell)).toBeNull();
    expect(isAllowedUploadType(detectMimeType(shell))).toBe(false);
  });

  it('rejects an empty or truncated file', () => {
    expect(detectMimeType(Buffer.alloc(0))).toBeNull();
    expect(detectMimeType(Buffer.from([0xff, 0xd8]))).toBeNull();
  });

  it('does not confuse a RIFF container that is not WebP', () => {
    const wav = Buffer.concat([
      Buffer.from('RIFF'),
      Buffer.from([0x24, 0x00, 0x00, 0x00]),
      Buffer.from('WAVEfmt '),
    ]);
    expect(detectMimeType(wav)).toBeNull();
  });

  it('maps each type to a file extension', () => {
    expect(extensionFor('image/jpeg')).toBe('jpg');
    expect(extensionFor('application/pdf')).toBe('pdf');
  });
});
