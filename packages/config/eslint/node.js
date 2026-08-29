import globals from 'globals';
import { baseConfig } from './base.js';

/** ESLint config for Node.js / NestJS packages. */
export const nodeConfig = [
  ...baseConfig,
  {
    languageOptions: {
      globals: { ...globals.node },
    },
    rules: {
      // NestJS relies heavily on parameter decorators and DI metadata.
      '@typescript-eslint/no-extraneous-class': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
];

export default nodeConfig;
