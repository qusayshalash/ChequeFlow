import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Next writes AGENTS.md/CLAUDE.md on dev start; this repo manages its own docs.
  agentRules: false,
  // Workspace packages ship TypeScript-compiled JS; Next transpiles them so
  // the dashboard and the API always share the exact same validation code.
  transpilePackages: [
    '@cheque-flow/api-client',
    '@cheque-flow/localization',
    '@cheque-flow/shared-types',
    '@cheque-flow/ui',
    '@cheque-flow/validation',
  ],
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'DENY' },
          { key: 'Referrer-Policy', value: 'no-referrer' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
    ];
  },
};

export default nextConfig;
