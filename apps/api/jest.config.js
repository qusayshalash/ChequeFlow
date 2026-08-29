/** Unit tests. Integration/e2e tests live in jest.e2e.config.js. */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  testRegex: 'src/.*\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    // swc keeps `emitDecoratorMetadata`, which NestJS DI depends on.
    '^.+\\.ts$': ['@swc/jest'],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.spec.ts', '!src/main.ts'],
  clearMocks: true,
};
