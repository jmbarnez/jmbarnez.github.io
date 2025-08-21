// Flat config for ESLint v9+
import js from '@eslint/js';
import pluginImport from 'eslint-plugin-import';
import prettier from 'eslint-config-prettier';

export default [
  js.configs.recommended,
  {
    // Include server code in Node environment configuration
    files: ['src/**/*.{js,ts}', 'functions/**/*.js', 'server/**/*.js'],
    ignores: ['dist/**', 'node_modules/**'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        window: 'readonly',
        document: 'readonly',
        console: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly',
        setInterval: 'readonly',
        clearInterval: 'readonly',
        requestAnimationFrame: 'readonly',
        fetch: 'readonly',
        // Browser built-ins used directly in code
        localStorage: 'readonly',
        Audio: 'readonly',
        getComputedStyle: 'readonly',
        FormData: 'readonly',
      },
      env: {
        node: true,
      },
    },
    plugins: {
      import: pluginImport,
    },
    rules: {
      // Keep warnings light; project uses Prettier for formatting
      'no-unused-vars': ['warn', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'import/order': [
        'warn',
        {
          groups: [['builtin', 'external'], 'internal', ['parent', 'sibling', 'index']],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      // Allow intentionally empty catch blocks (common for optional APIs)
      'no-empty': ['warn', { allowEmptyCatch: true }],
    },
  },
  // Disable stylistic rules that conflict with Prettier
  prettier,
];
