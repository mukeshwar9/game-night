import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores([
    'dist/**',
    'dev-dist/**',
    'dist-e2e/**',
    // Captain's HTML review pages (hand-written, not app code).
    '.lavish/**',
    'playwright-report/**',
    'test-results/**',
  ]),
  {
    files: ['**/*.{js,jsx,mjs}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // Firebase Cloud Functions: plain Node CommonJS, not part of the Vite/browser
    // app. Linted with the root config (only index.js; functions/node_modules is
    // ignored by ESLint's default node_modules ignore).
    files: ['functions/**/*.js'],
    languageOptions: {
      globals: globals.node,
      sourceType: 'commonjs',
    },
  },
  {
    // Code that runs in Node (process, fs, …): build/CI helpers, rules + e2e
    // tests and their setup, and the root tool configs (vite, vitest,
    // playwright, tailwind, postcss). Merged on top of the browser globals
    // above, so e2e specs can still reference `window` inside page.evaluate.
    files: ['scripts/**/*.{js,mjs}', 'tests/**/*.{js,mjs}', '*.config.{js,mjs}'],
    languageOptions: {
      globals: globals.node,
    },
  },
  {
    // Vite config runs under Node during the build; Vite's config loader shims __dirname.
    files: ['vite.config.js'],
    languageOptions: {
      globals: { __dirname: 'readonly' },
    },
  },
])
