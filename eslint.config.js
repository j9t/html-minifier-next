import js from '@eslint/js';

export default [
  {
    ignores: [
      'benchmarks/**',
      'build/**',
      'demo/build/**',
      'demo/public/**',
      'dist/**',
      'node_modules/**'
    ]
  },
  js.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        Buffer: 'readonly',
        console: 'readonly',
        document: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        window: 'readonly'
      }
    },
    rules: {
      // Minimal rules to match original code style
      'no-unused-vars': 'error',
      'no-undef': 'error'
    }
  },
  {
    // Browser environment for demo files
    files: ['demo/**/*.js'],
    languageOptions: {
      globals: {
        clearTimeout: 'readonly',
        LZString: 'readonly',
        navigator: 'readonly',
        setTimeout: 'readonly'
      }
    }
  }
];