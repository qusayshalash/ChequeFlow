import nodeConfig from '@cheque-flow/config/eslint/node';

export default [
  ...nodeConfig,
  {
    ignores: ['src/generated/**'],
  },
];
