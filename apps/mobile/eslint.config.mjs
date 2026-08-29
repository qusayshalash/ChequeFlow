import reactConfig from '@cheque-flow/config/eslint/react';

export default [
  ...reactConfig,
  {
    ignores: ['.expo/**', 'dist/**'],
  },
];
