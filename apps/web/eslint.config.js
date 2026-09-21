import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist', 'dev-dist', 'node_modules'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
    plugins: { 'react-hooks': reactHooks, 'react-refresh': reactRefresh },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],
      // Colours come from design tokens, never inline hex in components.
      'no-restricted-syntax': [
        'error',
        {
          selector: "Literal[value=/#[0-9a-fA-F]{6}\\b/]",
          message: 'Use a design token (bg-brand, text-ink, …) instead of a hex colour.',
        },
      ],
    },
  },
  {
    // The token file, the map marker builder, and the demo host shell are the only places
    // raw colours may live. The host shell is illustration of somebody else's app, not
    // Agent Finder UI, so it deliberately does not draw on our palette.
    files: ['src/design/tokens.ts', 'src/features/map/**', 'src/features/host/**', 'vite.config.ts'],
    rules: { 'no-restricted-syntax': 'off' },
  },
)
