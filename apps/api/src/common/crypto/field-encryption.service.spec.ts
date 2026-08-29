import { FieldEncryptionService } from './field-encryption.service';
import type { AppConfigService } from '../../config/app-config.service';

function buildService(key = Buffer.alloc(32, 3)): FieldEncryptionService {
  const config = { fieldEncryptionKey: key } as AppConfigService;
  return new FieldEncryptionService(config);
}

describe('FieldEncryptionService', () => {
  const service = buildService();

  it('round-trips a value', () => {
    const cipher = service.encrypt('SA0380000000608010167519');
    expect(cipher).not.toContain('608010167519');
    expect(service.decrypt(cipher)).toBe('SA0380000000608010167519');
  });

  it('produces a different ciphertext each time (random IV)', () => {
    expect(service.encrypt('1234567890')).not.toBe(service.encrypt('1234567890'));
  });

  it('detects tampering instead of returning garbage', () => {
    const cipher = service.encrypt('1234567890');
    const parts = cipher.split(':');
    const tampered = [parts[0], parts[1], parts[2], Buffer.from('evil').toString('base64')].join(
      ':',
    );
    expect(service.decrypt(tampered)).toBeNull();
  });

  it('returns null when decrypted with the wrong key', () => {
    const cipher = service.encrypt('1234567890');
    expect(buildService(Buffer.alloc(32, 9)).decrypt(cipher)).toBeNull();
  });

  it('masks all but the last four digits', () => {
    expect(FieldEncryptionService.mask('1234567890')).toBe('******7890');
    expect(FieldEncryptionService.mask('123')).toBe('***');
    expect(FieldEncryptionService.mask(null)).toBeNull();
  });

  it('never returns the full number when masking a stored value', () => {
    const cipher = service.encrypt('9876543210');
    const masked = service.decryptAndMask(cipher);
    expect(masked).toBe('******3210');
    expect(masked).not.toContain('987654');
  });
});
