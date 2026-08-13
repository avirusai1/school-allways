import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@saw/db': path.resolve(__dirname, '../../db/schema/index.ts'),
      'drizzle-orm': path.resolve(__dirname, '../../db/node_modules/drizzle-orm'),
    },
  },
  test: { environment: 'node', include: ['src/**/*.spec.ts'] },
});
