/* eslint-disable @typescript-eslint/no-require-imports */
const Module = require('node:module');
const load = Module._load;
globalThis.__authFormRoutes = [];
Module._load = function authFormTestLoad(request, parent, isMain) {
  if (request === 'next-intl') return { useTranslations: () => (key) => key };
  if (request === 'next/navigation') {
    return {
      useRouter: () => ({
        replace(destination) {
          globalThis.__authFormRoutes.push(destination);
        },
        push() {},
        refresh() {},
        back() {},
        forward() {},
        prefetch() {},
      }),
    };
  }
  return load.call(this, request, parent, isMain);
};
