/**
 * End-to-end tests. They require a live PostgreSQL database supplied through
 * TEST_DATABASE_URL; when it is missing the suites skip themselves instead of
 * failing, so `pnpm test` stays runnable without infrastructure.
 */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: 'test/.*\\.e2e-spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.ts$': ['@swc/jest'],
  },
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  testTimeout: 30000,
  clearMocks: true,
};
