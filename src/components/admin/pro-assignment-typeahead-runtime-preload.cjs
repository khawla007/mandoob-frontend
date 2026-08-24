// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('node:module');
const load = Module._load;
Module._load = function loadTypeaheadRuntimeDependency(request, parent, isMain) {
  if (request === 'next-intl') {
    return {
      useTranslations: () => (key, values) =>
        key === 'typeahead.results' ? `${values?.count ?? 0} results` : key,
      NextIntlClientProvider: ({ children }) => children,
    };
  }
  return load.call(this, request, parent, isMain);
};
