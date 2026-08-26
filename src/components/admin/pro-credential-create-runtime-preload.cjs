// eslint-disable-next-line @typescript-eslint/no-require-imports
const Module = require('node:module');

const copy = {
  en: {
    empty: 'No credential has been created.',
    createDraft: 'Create credential draft',
    creatingDraft: 'Creating draft…',
    createDraftError: 'The credential draft could not be created. Try again.',
    createDraftSuccess: 'Credential draft created.',
  },
  ar: {
    empty: 'لم يتم إنشاء بيانات اعتماد.',
    createDraft: 'إنشاء مسودة بيانات اعتماد',
    creatingDraft: 'جارٍ إنشاء المسودة…',
    createDraftError: 'تعذر إنشاء مسودة بيانات الاعتماد. حاول مرة أخرى.',
    createDraftSuccess: 'تم إنشاء مسودة بيانات الاعتماد.',
  },
};
const load = Module._load;
Module._load = function loadCreateDraftRuntimeDependency(request, parent, isMain) {
  if (request === 'next-intl') {
    return {
      useTranslations: () => (key) => copy[globalThis.__TEST_LOCALE__ ?? 'en'][key] ?? key,
    };
  }
  if (request === 'next/navigation') {
    return {
      useRouter: () => ({
        refresh() {
          globalThis.__TEST_REFRESHES__ = (globalThis.__TEST_REFRESHES__ ?? 0) + 1;
        },
      }),
    };
  }
  return load.call(this, request, parent, isMain);
};
