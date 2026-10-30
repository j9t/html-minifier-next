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
      // Comments only; code length is left to review
      'max-len': ['error', {
        code: Infinity,
        comments: 100,
        ignoreUrls: true,
        // JSDoc tags and typedef members can’t be wrapped
        ignorePattern: '^\\s*(?:/\\*)?\\*+\\s*(?:@|[\\w$]+\\??:)'
      }],
      'no-shadow': 'error',
      'no-var': 'error',
      'prefer-const': 'error'
    }
  },
  {
    ignores: ['demo/**'],
    languageOptions: {
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