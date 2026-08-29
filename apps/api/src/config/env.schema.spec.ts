import { validateEnv } from './env.schema';

const base = {
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_ACCESS_SECRET: 'a'.repeat(40),
  JWT_REFRESH_SECRET: 'b'.repeat(40),
  FIELD_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  S3_ENDPOINT: 'http://localhost:9000',
  S3_BUCKET: 'cheque-images',
  S3_ACCESS_KEY_ID: 'key',
  S3_SECRET_ACCESS_KEY: 'secret',
};

describe('validateEnv', () => {
  it('applies documented defaults', () => {
    const env = validateEnv(base);
    expect(env.API_PORT).toBe(3333);
    expect(env.JWT_ACCESS_TTL).toBe(900);
    expect(env.CORS_ORIGINS).toEqual(['http://localhost:3000']);
    expect(env.REMINDER_OFFSET_DAYS).toEqual([7, 3, 1, 0]);
  });

  it('rejects a short JWT secret', () => {
    expect(() => validateEnv({ ...base, JWT_ACCESS_SECRET: 'short' })).toThrow(/JWT_ACCESS_SECRET/);
  });

  it('rejects an encryption key that is not 32 bytes', () => {
    expect(() =>
      validateEnv({ ...base, FIELD_ENCRYPTION_KEY: Buffer.alloc(16).toString('base64') }),
    ).toThrow(/32 bytes/);
  });

  it('rejects placeholder secrets in production', () => {
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: 'replace_me_with_a_long_random_string_xxxxx',
      }),
    ).toThrow(/Placeholder secrets/);
  });

  it('rejects identical access and refresh secrets in production', () => {
    const secret = 'c'.repeat(40);
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        JWT_ACCESS_SECRET: secret,
        JWT_REFRESH_SECRET: secret,
      }),
    ).toThrow(/must differ/);
  });

  it('defaults to the free Google Vision provider', () => {
    expect(validateEnv(base).OCR_PROVIDER).toBe('google');
  });

  it('allows a missing OCR credential outside production', () => {
    // Development degrades to the mock provider with a loud warning instead
    // of refusing to boot, so a fresh clone runs with no cloud account.
    expect(() => validateEnv({ ...base, OCR_PROVIDER: 'claude' })).not.toThrow();
    expect(() => validateEnv({ ...base, OCR_PROVIDER: 'google' })).not.toThrow();
  });

  it('refuses the claude OCR provider without an API key in production', () => {
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        JWT_REFRESH_SECRET: 'z'.repeat(40),
        OCR_PROVIDER: 'claude',
      }),
    ).toThrow(/ANTHROPIC_API_KEY is required/);
  });

  it('accepts the claude OCR provider once a key is present', () => {
    const env = validateEnv({ ...base, OCR_PROVIDER: 'claude', ANTHROPIC_API_KEY: 'sk-ant-test' });
    expect(env.OCR_PROVIDER).toBe('claude');
    expect(env.OCR_CLAUDE_MODEL).toBe('claude-opus-5');
  });

  it('refuses the google OCR provider without credentials in production', () => {
    expect(() =>
      validateEnv({
        ...base,
        NODE_ENV: 'production',
        JWT_REFRESH_SECRET: 'z'.repeat(40),
        OCR_PROVIDER: 'google',
      }),
    ).toThrow(/GOOGLE_VISION_KEY_FILE/);
  });

  it('accepts the google provider with a key file', () => {
    const env = validateEnv({ ...base, OCR_PROVIDER: 'google', GOOGLE_VISION_KEY_FILE: '/k.json' });
    expect(env.OCR_PROVIDER).toBe('google');
  });

  it('accepts the google provider with application default credentials', () => {
    const env = validateEnv({
      ...base,
      OCR_PROVIDER: 'google',
      GOOGLE_APPLICATION_CREDENTIALS: '/adc.json',
    });
    expect(env.OCR_PROVIDER).toBe('google');
  });

  it('rejects an unknown OCR provider', () => {
    expect(() => validateEnv({ ...base, OCR_PROVIDER: 'tesseract' })).toThrow(/OCR_PROVIDER/);
  });

  it('parses a comma separated CORS list', () => {
    const env = validateEnv({ ...base, CORS_ORIGINS: 'https://a.com, https://b.com' });
    expect(env.CORS_ORIGINS).toEqual(['https://a.com', 'https://b.com']);
  });
});
