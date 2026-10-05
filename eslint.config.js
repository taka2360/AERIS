import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'playwright-report', 'test-results'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2023, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Dependency direction: ui → query → services → domain ← sources
    files: ['src/ui/**/*.{ts,tsx}'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/sources/*', '**/sources/*'],
              message: 'UI must not depend on data sources. Use query hooks and domain types.',
            },
          ],
        },
      ],
    },
  },
  {
    // query and services read source *data* only through domain types. The one
    // exception is the registry: declarative metadata (poll cadence, freshness)
    // that it alone owns. Composition roots (providers/, main.tsx) are out of scope.
    files: ['src/query/**/*.{ts,tsx}', 'src/services/**/*.ts'],
    ignores: ['**/*.test.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/sources/*', '!@/sources/registry', '**/sources/*', '!**/sources/registry'],
              message:
                'query/services must not depend on source adapters. Use domain types; only @/sources/registry (declarative metadata) is allowed.',
            },
          ],
        },
      ],
    },
  },
  {
    files: ['src/domain/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/sources/*', '@/services/*', '@/query/*', '@/ui/*', 'react'],
              message: 'Domain must stay framework- and source-agnostic.',
            },
          ],
        },
      ],
    },
  },
  {
    // Playwright fixtures call `use()`, which is not a React hook.
    files: ['tests/**/*.ts'],
    rules: { 'react-hooks/rules-of-hooks': 'off' },
  },
)
