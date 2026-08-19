import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'demo/build/**',
      'demo/public/**',
      'dist/**'
    ]
  },
  js.configs.recommended,
  {
    rules: {
      curly: ['error', 'multi-line'],
      eqeqeq: ['error', 'smart'],
      'no-shadow': 'error',
      'no-var': 'error',
      'prefer-const': 'error'
    }
  },
  {
    ignores: ['demo/**'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: globals.node
    }
  },
  {
    // Browser environment for demo files
    files: ['demo/**/*.js'],
    languageOptions: {
      globals: {
        ...globals.browser,
        LZString: 'readonly'
      }
    }
  }
];