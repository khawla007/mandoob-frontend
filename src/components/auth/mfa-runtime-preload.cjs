/* eslint-disable @typescript-eslint/no-require-imports */
const Module = require('node:module');
const load = Module._load;
globalThis.__mfaUnenrollCalls = 0;
globalThis.__mfaRoutes = [];
globalThis.__mfaListFactorsResult = { data: { totp: [] }, error: null };
Module._load = function mfaRuntimeTestLoad(request, parent, isMain) {
  if (request === 'next-intl') return { useTranslations: () => (key) => key };
  if (request === 'next/navigation') {
    return {
      useRouter: () => ({
        replace(destination) {
          globalThis.__mfaRoutes.push(destination);
        },
      }),
    };
  }
  if (request.endsWith('/lib/supabase/browser')) {
    return {
      getSupabaseBrowserClient: () => ({
        auth: {
          mfa: {
            listFactors: async () => globalThis.__mfaListFactorsResult,
            unenroll: async () => {
              globalThis.__mfaUnenrollCalls += 1;
              return { error: null };
            },
          },
        },
      }),
    };
  }
  return load.call(this, request, parent, isMain);
};
