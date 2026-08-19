import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';

export default defineConfig({
  base: '/admin/',
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@saw/ui': path.resolve(__dirname, '../../packages/ui/src'),
      '@saw/shared-types': path.resolve(__dirname, '../../packages/shared-types/src'),
    },
  },
  server: { port: 5173 },
  build: {
    target: 'es2022',
    sourcemap: true,
  },
});
