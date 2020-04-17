module.exports = {
  env: {
    browser: true,
    commonjs: true,
    es6: true,
  },
  extends: ['standard', 'plugin:prettier/recommended'],
  globals: {
    Atomics: 'readonly',
    SharedArrayBuffer: 'readonly',
    Runtime: true,
  },
  parserOptions: {
    ecmaVersion: 2018,
  },
  rules: {},
};
