import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{js,jsx}'],
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
    // Firebase Cloud Functions: plain Node CommonJS, not part of the Vite/browser app.
    files: ['functions/**/*.js'],
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
