module.exports = {
  root: true,
  env: {
    es6: true,
    node: true,
  },
  parserOptions: {
    ecmaVersion: 2020,
  },
  extends: ['eslint:recommended'],
  rules: {
    'no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': 'off', // Allow console.log/error in Cloud Functions
    quotes: ['error', 'single', { avoidEscape: true }],
    semi: ['error', 'always'],
    indent: ['error', 2],
    'comma-dangle': ['error', 'only-multiline'],
    'object-curly-spacing': ['error', 'always'],
    'array-bracket-spacing': ['error', 'never'],
  },
  overrides: [
    {
      // Jest test files
      files: ['test/**/*.js', '**/*.test.js', '**/*.spec.js'],
      env: {
        jest: true,
      },
    },
  ],
};
