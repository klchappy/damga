// Damga — ESLint v9 flat config.
// Workspace genelinde temel kurallar. Strict olmayan, prag­matik bir setup.
//
// Çalıştırma:
//   pnpm lint              (root) — tüm paketler
//   pnpm lint --fix        — otomatik fix
//   pnpm -F @damga/api lint
//   pnpm -F @damga/web lint
//
// Test/script dosyaları gevşek kurallarla — production kod sıkı.
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import react from 'eslint-plugin-react';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.next/**',
      '**/coverage/**',
      '**/*.d.ts',
      'apps/web/src/sw.ts', // PWA SW — vite-plugin-pwa kendi build'i
    ],
  },
  // Tüm TS/TSX dosyalar için temel
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
    },
    rules: {
      // Pragmatik kararlar — projeyi durdurmamalı, ama uyarı vermeli
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      '@typescript-eslint/no-empty-object-type': 'off', // `{}` legitimately useful
      '@typescript-eslint/no-require-imports': 'off',
      'no-empty': ['warn', { allowEmptyCatch: true }],
      'no-console': ['warn', { allow: ['warn', 'error', 'info'] }],
      'prefer-const': 'warn',
      'no-var': 'error',
      // ESLint v10: catch'te orijinal error'ı `cause`'a takmak best practice ama
      // mevcut kodda yaygın değil — uyarı olarak işaretle, error değil
      'preserve-caught-error': 'warn',
    },
  },
  // React-specific (apps/web)
  {
    files: ['apps/web/src/**/*.{ts,tsx}'],
    plugins: {
      react,
      'react-hooks': reactHooks,
    },
    settings: { react: { version: 'detect' } },
    rules: {
      // React 17+ JSX transform — React import gerekmiyor
      'react/react-in-jsx-scope': 'off',
      'react/prop-types': 'off',
      'react/jsx-uses-react': 'off',
      'react-hooks/rules-of-hooks': 'error',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
  // Test dosyaları gevşek
  {
    files: ['**/*.test.{ts,tsx}', '**/tests/**'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'off',
      'no-console': 'off',
    },
  },
  // Script dosyaları gevşek
  {
    files: ['**/scripts/**'],
    rules: {
      'no-console': 'off',
      '@typescript-eslint/no-explicit-any': 'off',
    },
  },
);
