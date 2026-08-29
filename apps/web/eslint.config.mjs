import reactConfig from '@cheque-flow/config/eslint/react';

export default [
  ...reactConfig,
  {
    ignores: ['.next/**', 'next-env.d.ts'],
  },
];
