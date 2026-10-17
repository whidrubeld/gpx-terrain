// @ts-check
import js from '@eslint/js'
import prettier from 'eslint-config-prettier'
import reactHooks from 'eslint-plugin-react-hooks'
import { defineConfig, globalIgnores } from 'eslint/config'
import globals from 'globals'
import tseslint from 'typescript-eslint'

export default defineConfig(
  globalIgnores([
    'dist',
    'dev-dist',
    'coverage',
    'playwright-report',
    'test-results'
  ]),
  js.configs.recommended,
  tseslint.configs.strictTypeChecked,
  tseslint.configs.stylisticTypeChecked,
  {
    languageOptions: {
      globals: globals.browser,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname
      }
    },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      // the classic rules only: the React Compiler ones (refs, immutability…)
      // flag what React Three Fiber code does on purpose in `useFrame`
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'error',
      // `onClick={() => setSomething(value)}` is how React reads
      '@typescript-eslint/no-confusing-void-expression': [
        'error',
        { ignoreArrowShorthand: true }
      ],
      // `text || null`: an empty string means "none" in GPX files
      '@typescript-eslint/prefer-nullish-coalescing': [
        'error',
        { ignorePrimitives: { string: true } }
      ],
      '@typescript-eslint/restrict-template-expressions': [
        'error',
        { allowNumber: true }
      ],
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
      ]
    }
  },
  {
    files: ['**/*.test.ts'],
    rules: { '@typescript-eslint/no-non-null-assertion': 'off' }
  },
  {
    files: ['e2e/**', '*.config.{ts,mts}'],
    languageOptions: { globals: globals.node }
  },
  {
    files: ['src/sw.ts'],
    languageOptions: { globals: globals.serviceworker }
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    extends: [tseslint.configs.disableTypeChecked],
    languageOptions: { globals: globals.node }
  },
  prettier
)
