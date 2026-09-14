/* eslint-disable @typescript-eslint/no-require-imports */
const Module = require('node:module');
const load = Module._load;
Module._load = function authPasswordTestLoad(request, parent, isMain) {
  if (request === 'next-intl') {
    return {
      useTranslations: () => (key) =>
        ({ showPassword: 'Show password', hidePassword: 'Hide password' })[key] ?? key,
    };
  }
  return load.call(this, request, parent, isMain);
};
