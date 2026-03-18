module.exports = {
  root: true,
  env: {
    browser: true,
    es2020: true,
  },
  extends: [
    'eslint:recommended',
    'plugin:react/recommended',
    'plugin:react/jsx-runtime',
    'plugin:react-hooks/recommended',
  ],
  parserOptions: {
    ecmaVersion: 'latest',
    sourceType: 'module',
    ecmaFeatures: { jsx: true },
  },
  plugins: ['react-refresh'],
  rules: {
    'react-refresh/only-export-components': 'warn',
    'react/prop-types': 'off',               // no PropTypes in this project
    'no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
    'no-console': 'off',                     // console.error used intentionally
  },
  settings: {
    react: { version: 'detect' },
  },
}
