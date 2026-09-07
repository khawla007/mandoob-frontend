import type { ApplicationDefinition, ApplicationDraft } from './contracts';

export const APPLICATION_FILE_SIZE_LIMIT_BYTES = 10 * 1024 * 1024;

export type FilePreviewMediaType = 'application/pdf' | 'image/jpeg' | 'image/png';
export type FilePreviewMetadata = {
  displayName: string;
  mediaType: FilePreviewMediaType;
  sizeBytes: number;
};
export type FilePreviewState = Readonly<Record<string, FilePreviewMetadata>>;
export type FilePreviewDescriptor = {
  readonly name: string;
  readonly type: string;
  readonly size: number;
};

type SelectPreviewFileInput = {
  state: FilePreviewState;
  controlId: string;
  files: readonly FilePreviewDescriptor[];
  definition: ApplicationDefinition;
  draft: ApplicationDraft;
};

export type SelectPreviewFileResult =
  | { status: 'accepted'; state: FilePreviewState }
  | {
      status:
        | 'invalid-control'
        | 'multiple-files'
        | 'unsupported-type'
        | 'too-large'
        | 'invalid-file';
      state: FilePreviewState;
    };

const ALLOWED_MEDIA_TYPES = new Set<FilePreviewMediaType>([
  'application/pdf',
  'image/jpeg',
  'image/png',
]);

export function getAllowedDocumentControlIds(
  definition: ApplicationDefinition,
  draft: Pick<ApplicationDraft, 'shareholders'>,
) {
  const ids: string[] = [];
  for (const rule of definition.documentRules) {
    if (rule.owner === 'contact') ids.push(`${rule.documentId}:contact`);
    if (rule.owner === 'business') ids.push(`${rule.documentId}:business`);
    if (rule.owner === 'each-shareholder') {
      for (const shareholder of draft.shareholders) {
        ids.push(`${rule.documentId}:${shareholder.id}`);
      }
    }
  }
  return ids;
}

export function selectPreviewFile(input: SelectPreviewFileInput): SelectPreviewFileResult {
  const { state, controlId, files, definition, draft } = input;
  if (!getAllowedDocumentControlIds(definition, draft).includes(controlId)) {
    return { status: 'invalid-control', state };
  }
  if (files.length !== 1) return { status: 'multiple-files', state };

  const file = files[0];
  if (
    typeof file.name !== 'string' ||
    sanitizedDisplayName(file.name) === '' ||
    !Number.isSafeInteger(file.size) ||
    file.size < 0
  ) {
    return { status: 'invalid-file', state };
  }
  if (!ALLOWED_MEDIA_TYPES.has(file.type as FilePreviewMediaType)) {
    return { status: 'unsupported-type', state };
  }
  if (file.size > APPLICATION_FILE_SIZE_LIMIT_BYTES) return { status: 'too-large', state };

  return {
    status: 'accepted',
    state: {
      ...state,
      [controlId]: {
        displayName: sanitizedDisplayName(file.name),
        mediaType: file.type as FilePreviewMediaType,
        sizeBytes: file.size,
      },
    },
  };
}

export function removePreviewFile(state: FilePreviewState, controlId: string): FilePreviewState {
  if (!(controlId in state)) return state;
  const next = { ...state };
  delete next[controlId];
  return next;
}

export function clearFilePreviewsAfterRefresh(state: FilePreviewState): FilePreviewState {
  void state;
  return {};
}

export function clearFilePreviewsAfterReset(state: FilePreviewState): FilePreviewState {
  void state;
  return {};
}

export function clearFilePreviewsAfterSuccess(state: FilePreviewState): FilePreviewState {
  void state;
  return {};
}

function sanitizedDisplayName(name: string) {
  const basename = name.split(/[\\/]/).at(-1) ?? '';
  return basename
    .replace(/[\u0000-\u001f\u007f]/g, '')
    .trim()
    .slice(0, 180);
}
