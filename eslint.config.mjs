import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * One flat config for every TypeScript workspace.
 *
 * Per-workspace configs would mean seven copies of the same dependency set,
 * because pnpm's strict node_modules does not hoist a root devDependency into
 * a workspace. A single root run is also faster than seven turbo tasks that
 * each pay eslint's startup cost.
 *
 * Type-aware linting is deliberately off. It needs a full type-check per file
 * and would roughly double CI time on the 2 vCPU box for rules that mostly
 * duplicate what `pnpm typecheck` already enforces.
 */
export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/out/**',
      '**/coverage/**',
      '**/.turbo/**',
      '**/.dart_tool/**',
      'db/migrations/**',
      '**/*.tsbuildinfo',
      // Written by `next dev`/`next build`, not by us.
      '**/next-env.d.ts',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  {
    languageOptions: {
      globals: { ...globals.node, ...globals.browser },
    },
    rules: {
      // `.cursorrules`: no `any` — use `unknown` and narrow. An error, not a
      // warning, because a warning here is a rule nobody enforces.
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        // The `_grant` convention for a permission taken but intentionally
        // unused, and destructuring a field out to drop it, are both fine.
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
          ignoreRestSiblings: true,
        },
      ],
    },
  },

  {
    files: ['apps/web-*/**/*.{ts,tsx}', 'packages/ui/**/*.{ts,tsx}'],
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // The rule that actually catches bugs in this codebase: a query or
      // effect reading state it never re-runs on is a stale-data bug that
      // typechecks cleanly.
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },

  {
    files: ['**/*.cjs'],
    rules: {
      // CommonJS by design: these are the loader shims and one-off runners
      // that have to work before any ESM/TS pipeline is in play.
      '@typescript-eslint/no-require-imports': 'off',
    },
  },

  {
    files: ['**/*.spec.ts', '**/*.test.ts', 'scripts/**/*.mjs', 'db/seeds/**/*.ts'],
    rules: {
      // Test doubles and one-off scripts get to be loose about shapes.
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
