#!/usr/bin/env node
/**
 * Wrapper — delegates to the TypeScript bench (real Drizzle batched inserts).
 *
 *   node scripts/bench-import.mjs --rows 1000
 *   node scripts/bench-import.mjs --rows 5000
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const result = spawnSync(
  'pnpm',
  [
    '--filter',
    '@saw/db',
    'exec',
    'tsx',
    path.join(root, 'scripts/bench-import.ts'),
    ...args,
  ],
  { cwd: root, stdio: 'inherit', env: process.env },
);
process.exit(result.status ?? 1);
