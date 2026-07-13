import js from '@eslint/js';

export default [
  {
    ignores: ['dist/**', 'node_modules/**', 'functions/**'],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'test/**/*.js', 'scripts/**/*.js'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        document: 'readonly',
        window: 'readonly',
        location: 'readonly',
        console: 'readonly',
        FormData: 'readonly',
        setTimeout: 'readonly',
        process: 'readonly',
        URL: 'readonly',
      },
    },
  },
];
