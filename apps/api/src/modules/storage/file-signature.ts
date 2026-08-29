/**
 * Magic-byte file type detection.
 *
 * The uploaded file's extension and its `Content-Type` header are both
 * attacker controlled, so the real type is determined from the bytes.
 */

export type DetectedMimeType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf';

export const ALLOWED_UPLOAD_TYPES: readonly DetectedMimeType[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'application/pdf',
];

function startsWith(buffer: Buffer, bytes: readonly number[], offset = 0): boolean {
  if (buffer.length < offset + bytes.length) return false;
  return bytes.every((byte, index) => buffer[offset + index] === byte);
}

/** Returns the real media type of a buffer, or `null` when unrecognised. */
export function detectMimeType(buffer: Buffer): DetectedMimeType | null {
  // JPEG: FF D8 FF
  if (startsWith(buffer, [0xff, 0xd8, 0xff])) return 'image/jpeg';

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (startsWith(buffer, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';

  // WebP: "RIFF" .... "WEBP"
  if (
    startsWith(buffer, [0x52, 0x49, 0x46, 0x46]) &&
    startsWith(buffer, [0x57, 0x45, 0x42, 0x50], 8)
  ) {
    return 'image/webp';
  }

  // PDF: "%PDF-"
  if (startsWith(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) return 'application/pdf';

  return null;
}

export function isAllowedUploadType(mimeType: string | null): mimeType is DetectedMimeType {
  return mimeType !== null && (ALLOWED_UPLOAD_TYPES as readonly string[]).includes(mimeType);
}

export function extensionFor(mimeType: DetectedMimeType): string {
  switch (mimeType) {
    case 'image/jpeg':
      return 'jpg';
    case 'image/png':
      return 'png';
    case 'image/webp':
      return 'webp';
    case 'application/pdf':
      return 'pdf';
  }
}
