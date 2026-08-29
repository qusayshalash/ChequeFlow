import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

import { Injectable, Logger } from '@nestjs/common';

import { AppConfigService } from '../../config/app-config.service';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const VERSION = 'v1';

/**
 * Authenticated encryption for sensitive columns (bank account numbers, IBANs).
 *
 * Ciphertext format: `v1:<iv-base64>:<tag-base64>:<data-base64>`. The version
 * prefix leaves room to rotate keys or algorithms without a data migration.
 */
@Injectable()
export class FieldEncryptionService {
  private readonly logger = new Logger(FieldEncryptionService.name);

  constructor(private readonly config: AppConfigService) {}

  encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.config.fieldEncryptionKey, iv, {
      authTagLength: AUTH_TAG_LENGTH,
    });
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [
      VERSION,
      iv.toString('base64'),
      tag.toString('base64'),
      encrypted.toString('base64'),
    ].join(':');
  }

  /** Returns `null` for tampered or undecryptable values instead of throwing. */
  decrypt(ciphertext: string): string | null {
    const parts = ciphertext.split(':');
    if (parts.length !== 4 || parts[0] !== VERSION) {
      this.logger.warn('Encountered a field with an unrecognised ciphertext format');
      return null;
    }
    const [, ivPart, tagPart, dataPart] = parts as [string, string, string, string];
    try {
      const decipher = createDecipheriv(
        ALGORITHM,
        this.config.fieldEncryptionKey,
        Buffer.from(ivPart, 'base64'),
        { authTagLength: AUTH_TAG_LENGTH },
      );
      decipher.setAuthTag(Buffer.from(tagPart, 'base64'));
      const decrypted = Buffer.concat([
        decipher.update(Buffer.from(dataPart, 'base64')),
        decipher.final(),
      ]);
      return decrypted.toString('utf8');
    } catch {
      // Never log the ciphertext itself.
      this.logger.warn('Failed to decrypt an encrypted field (wrong key or tampered value)');
      return null;
    }
  }

  encryptNullable(plaintext: string | null | undefined): string | null {
    return plaintext ? this.encrypt(plaintext) : null;
  }

  /**
   * Masks an account number for display: only the last four digits survive.
   * Used everywhere account numbers appear in normal API responses.
   */
  static mask(value: string | null): string | null {
    if (!value) return null;
    const trimmed = value.replace(/\s/g, '');
    if (trimmed.length <= 4) return '*'.repeat(trimmed.length);
    return `${'*'.repeat(Math.min(trimmed.length - 4, 8))}${trimmed.slice(-4)}`;
  }

  /** Masks a stored ciphertext by decrypting it first. */
  decryptAndMask(ciphertext: string | null): string | null {
    if (!ciphertext) return null;
    return FieldEncryptionService.mask(this.decrypt(ciphertext));
  }

  /** SHA-256 helper used for refresh tokens and image de-duplication. */
  static sha256(value: string | Buffer): string {
    return createHash('sha256').update(value).digest('hex');
  }
}
