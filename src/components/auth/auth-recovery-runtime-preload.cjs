/* eslint-disable @typescript-eslint/no-require-imports */
const Module = require('node:module');
const load = Module._load;
Module._load = function authRecoveryTestLoad(request, parent, isMain) {
  if (request === 'next-intl') return { useTranslations: () => (key) => key };
  if (request === 'next/navigation') {
    return { useRouter: () => ({ replace() {} }) };
  }
  return load.call(this, request, parent, isMain);
};
