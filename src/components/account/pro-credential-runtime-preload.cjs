// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('node:module');

const load = Module._load;
Module._load = function loadCredentialRuntimeDependency(request, parent, isMain) {
  if (request === 'next-intl') {
    return {
      useTranslations: () => (key, values) =>
        values?.filename ? `${key}:${values.filename}` : key,
    };
  }
  if (request === 'next/navigation') {
    return {
      useRouter: () => ({
        refresh() {},
        push() {},
        replace() {},
        back() {},
        forward() {},
        prefetch() {},
      }),
    };
  }
  return load.call(this, request, parent, isMain);
};
