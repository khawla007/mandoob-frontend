import type { ProCredentialMask } from '@/lib/data/pro-credentials';
import { proCredentialDraftSaveSchema } from '@/lib/validation/pro-lifecycle';

export type ProCredentialSelfView = {
  create: boolean;
  edit: boolean;
  evidenceMutations: boolean;
  submit: boolean;
  replacement: boolean;
  readOnly: boolean;
};

export function buildProCredentialSelfView(
  credential: ProCredentialMask | null,
): ProCredentialSelfView {
  if (!credential) {
    return {
      create: true,
      edit: false,
      evidenceMutations: false,
      submit: false,
      replacement: false,
      readOnly: false,
    };
  }
  const draft = credential.state === 'draft';
  const terminal = ['rejected', 'expired', 'revoked'].includes(credential.state);
  return {
    create: false,
    edit: draft,
    evidenceMutations: draft,
    submit: draft,
    replacement: terminal,
    readOnly: !draft,
  };
}

export function createProCredentialSelfDraftSchema(hasStoredIdentifier: boolean) {
  return proCredentialDraftSaveSchema.superRefine((value, context) => {
    if (!hasStoredIdentifier && value.identifier === '') {
      context.addIssue({ code: 'custom', path: ['identifier'], message: 'Identifier is required' });
    }
  });
}

export function formatProEvidenceMime(
  mime: 'application/pdf' | 'image/jpeg' | 'image/png',
  translate: (key: 'mime.pdf' | 'mime.jpeg' | 'mime.png') => string,
): string {
  const keys = {
    'application/pdf': 'mime.pdf',
    'image/jpeg': 'mime.jpeg',
    'image/png': 'mime.png',
  } as const;
  return translate(keys[mime]);
}

export function formatProEvidenceCreatedDate(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale === 'ar' ? 'ar-AE' : 'en-AE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    timeZone: 'Asia/Dubai',
  }).format(new Date(value));
}

export function formatProEvidenceRemovalConfirmation(
  filename: string,
  translate: (key: 'removeConfirmation', values: { filename: string }) => string,
): string {
  return translate('removeConfirmation', { filename });
}
