import js from '@eslint/js';
import globals from 'globals';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';

/**
 * ESLint flat config (ESLint 9) — Bike Rent + Service Provider modules only.
 */
export default [
  {
    ignores: [
      'dist/**',
      'node_modules/**',
      'coverage/**',
      'public/**',
      'scripts/**',
      'src/modules/Food/**',
      'src/modules/taxi/**',
      'src/modules/porter/**',
      'src/modules/quickCommerce/**',
      'src/modules/common/**',
      'src/shared/**',
      'src/components/**',
      'src/core/**',
      'src/services/**',
      'src/lib/**',
      'src/hooks/**',
      'src/context/**',
      'src/utils/**',
      'src/pages/**',
      'src/App.jsx',
      'src/main.jsx',
    ],
  },
  {
    files: [
      'src/modules/bikeRent/**/*.{js,jsx}',
      'src/modules/serviceProvider/**/*.{js,jsx}',
    ],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.es2022,
      },
      parserOptions: {
        ecmaFeatures: { jsx: true },
      },
    },
    plugins: {
      react,
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    settings: {
      react: { version: 'detect' },
    },
    rules: {
      ...js.configs.recommended.rules,
      ...react.configs.recommended.rules,
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/jsx-uses-vars': 'error',
      'react/jsx-uses-react': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
      // Food-parity zone pages use the same declare-after-useEffect pattern
      'react-hooks/immutability': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/refs': 'off',
      'no-unused-vars': ['warn', {
        argsIgnorePattern: '^_',
        varsIgnorePattern: '^_',
        ignoreRestSiblings: true,
        caughtErrorsIgnorePattern: '^_',
      }],
      'no-console': 'off',
      'no-empty': 'warn',
      'no-undef': 'error',
      'react-refresh/only-export-components': 'off',
    },
  },
];
