import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    '.next/**',
    '.claude/worktrees/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
  ]),
  // Tier B i18n: forbid physical Tailwind directional classes inside the [locale] tree
  // so RTL layouts (e.g. /ar/*) flip automatically via logical properties.
  {
    files: ['src/app/\\[locale\\]/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: 'Literal[value=/\\b(ml-|mr-|pl-|pr-|text-left|text-right)\\b/]',
          message:
            'Use logical Tailwind classes (ms-/me-/ps-/pe-/text-start/text-end) inside the [locale] tree for RTL safety.',
        },
        {
          selector: 'TemplateElement[value.raw=/\\b(ml-|mr-|pl-|pr-|text-left|text-right)\\b/]',
          message:
            'Use logical Tailwind classes (ms-/me-/ps-/pe-/text-start/text-end) inside the [locale] tree for RTL safety.',
        },
      ],
    },
  },
]);

export default eslintConfig;
