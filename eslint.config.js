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
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        global: 'readonly',
        document: 'readonly',
        window: 'readonly'
      }
    },
    rules: {
      // Minimal rules to match existing code style
      'no-unused-vars': 'error',
      'no-undef': 'error'
    }
  },
  {
    // Browser environment for demo files
    files: ['demo/**/*.js'],
    languageOptions: {
      globals: {
        LZString: 'readonly',
        navigator: 'readonly',
        setTimeout: 'readonly',
        clearTimeout: 'readonly'
      }
    }
  }
];