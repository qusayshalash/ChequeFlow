/**
 * Runs before the e2e modules are imported.
 *
 * `AppModule` validates the environment at import time, so the test values
 * must exist before Jest requires it. Placeholders are only used to satisfy
 * the schema; suites that need a real database skip themselves when
 * TEST_DATABASE_URL is absent.
 */
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL =
  process.env.TEST_DATABASE_URL ??
  'postgresql://placeholder:placeholder@127.0.0.1:5432/placeholder';
process.env.JWT_ACCESS_SECRET ??= 'e2e-access-secret-that-is-long-enough-000001';
process.env.JWT_REFRESH_SECRET ??= 'e2e-refresh-secret-that-is-long-enough-00002';
process.env.FIELD_ENCRYPTION_KEY ??= Buffer.alloc(32, 5).toString('base64');
process.env.S3_ENDPOINT ??= 'http://127.0.0.1:9000';
process.env.S3_BUCKET ??= 'cheque-images-test';
process.env.S3_ACCESS_KEY_ID ??= 'test-access-key';
process.env.S3_SECRET_ACCESS_KEY ??= 'test-secret-key';
process.env.S3_FORCE_PATH_STYLE ??= 'true';
// The rate limits are a production concern; a suite that drives dozens of
// requests through one process in two seconds is not the traffic they guard
// against. Raised here rather than in the app so the real defaults still apply
// everywhere else.
process.env.RATE_LIMIT_DEFAULT_PER_MINUTE ??= '100000';
process.env.RATE_LIMIT_AUTH_PER_MINUTE ??= '100000';
process.env.RATE_LIMIT_UPLOAD_PER_MINUTE ??= '100000';
process.env.RATE_LIMIT_OCR_PER_MINUTE ??= '100000';

// Pinned on purpose: the suites must not depend on whatever the default
// provider happens to be, and must never call a cloud service.
process.env.OCR_PROVIDER = 'mock';
process.env.OCR_MOCK_LATENCY_MS ??= '0';
