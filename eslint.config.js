import js from '@eslint/js';
import globals from 'globals';

export default [
  {
    ignores: [
      'backtest/**',
      'build/**',
      'demo/build/**',
      'demo/public/**',
      'dist/**',
      'node_modules/**'
    ]
  },
  js.configs.recommended,
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