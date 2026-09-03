import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: { environment: 'node', include: ['{lib,components}/**/*.{test,spec}.ts'] },
});
