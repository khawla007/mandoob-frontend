import type {
  ApplicationDefinition,
  ApplicationDraft,
  ApplicationWorkspaceState,
} from './contracts';
import { emptyShareholder } from './definition';

export type ApplicationDraftAction =
  | { type: 'set-jurisdiction'; value: ApplicationDraft['setup']['jurisdiction'] }
  | { type: 'set-authority'; value: string | null }
  | { type: 'set-activity'; value: string | null }
  | { type: 'set-legal-structure'; value: ApplicationDraft['setup']['legalStructureId'] }
  | { type: 'set-visas-required'; value: boolean }
  | {
      type: 'set-visa-count';
      field: 'investorCount' | 'employeeCount' | 'familyCount';
      value: string;
    }
  | { type: 'set-office-type'; value: ApplicationDraft['setup']['officeTypeId'] }
  | { type: 'set-office-notes'; value: string }
  | { type: 'set-add-ons'; value: string[] }
  | { type: 'set-shareholder-count'; value: number }
  | {
      type: 'set-shareholder-field';
      shareholderId: string;
      field: 'fullName' | 'nationality' | 'ownershipBasisPoints';
      value: string;
    }
  | {
      type: 'set-document-readiness';
      documentId: string;
      value: 'ready' | 'not-ready';
    }
  | { type: 'set-confirmation'; field: keyof ApplicationDraft['confirmations']; value: boolean };

const emptyVisas: ApplicationDraft['visas'] = {
  required: null,
  investorCount: '',
  employeeCount: '',
  familyCount: '',
  estimatorTotalSuggestion: null,
};

export function reduceApplicationDraft(
  draft: ApplicationDraft,
  action: ApplicationDraftAction,
  definition: ApplicationDefinition,
): ApplicationDraft {
  let next: ApplicationDraft;
  switch (action.type) {
    case 'set-jurisdiction':
      next = {
        ...draft,
        business: { ...draft.business, activityId: null },
        setup: {
          jurisdiction: action.value,
          authorityId: null,
          legalStructureId: null,
          officeTypeId: null,
          officeNotes: '',
          addOnIds: [],
        },
        visas: { ...emptyVisas },
        documentReadiness: {},
      };
      break;
    case 'set-authority': {
      const authority = definition.authorities.find(
        (item) => item.id === action.value && item.jurisdiction === draft.setup.jurisdiction,
      );
      next = {
        ...draft,
        business: { ...draft.business, activityId: null },
        setup: {
          ...draft.setup,
          authorityId: authority?.id ?? null,
          legalStructureId: null,
          officeTypeId: null,
          officeNotes: '',
          addOnIds: [],
        },
        visas: { ...emptyVisas },
        documentReadiness: {},
      };
      break;
    }
    case 'set-activity': {
      const authority = selectedAuthority(draft, definition);
      next = {
        ...draft,
        business: {
          ...draft.business,
          activityId: authority?.activityIds.includes(action.value ?? '') ? action.value : null,
        },
        documentReadiness: {},
      };
      break;
    }
    case 'set-legal-structure': {
      const authority = selectedAuthority(draft, definition);
      next = {
        ...draft,
        setup: {
          ...draft.setup,
          legalStructureId: authority?.legalStructureIds.includes(action.value!)
            ? action.value
            : null,
        },
        documentReadiness: {},
      };
      break;
    }
    case 'set-visas-required':
      next = {
        ...draft,
        visas: action.value
          ? { ...emptyVisas, required: true }
          : { ...emptyVisas, required: false },
        setup: { ...draft.setup, officeTypeId: null, officeNotes: '' },
        documentReadiness: {},
      };
      break;
    case 'set-visa-count':
      next = {
        ...draft,
        visas: { ...draft.visas, [action.field]: action.value },
        setup: { ...draft.setup, officeTypeId: null, officeNotes: '' },
        documentReadiness: {},
      };
      break;
    case 'set-office-type': {
      const authority = selectedAuthority(draft, definition);
      const officeTypeId = authority?.officeTypeIds.includes(action.value!) ? action.value : null;
      next = {
        ...draft,
        setup: { ...draft.setup, officeTypeId, officeNotes: '' },
        documentReadiness: {},
      };
      break;
    }
    case 'set-office-notes':
      next = { ...draft, setup: { ...draft.setup, officeNotes: action.value } };
      break;
    case 'set-add-ons': {
      const authority = selectedAuthority(draft, definition);
      next = {
        ...draft,
        setup: {
          ...draft.setup,
          addOnIds: action.value.filter((id) => authority?.addOnIds.includes(id)),
        },
        documentReadiness: {},
      };
      break;
    }
    case 'set-shareholder-count': {
      const authority = selectedAuthority(draft, definition);
      const allowed =
        Number.isInteger(action.value) &&
        action.value >= (authority?.shareholderRange.min ?? 1) &&
        action.value <= (authority?.shareholderRange.max ?? 10);
      if (!allowed) return draft;
      const shareholders = draft.shareholders.slice(0, action.value);
      while (shareholders.length < action.value)
        shareholders.push(emptyShareholder(shareholders.length + 1));
      next = { ...draft, shareholders, documentReadiness: {} };
      break;
    }
    case 'set-shareholder-field':
      next = {
        ...draft,
        shareholders: draft.shareholders.map((row) =>
          row.id === action.shareholderId ? { ...row, [action.field]: action.value } : row,
        ),
        documentReadiness: {},
      };
      break;
    case 'set-document-readiness': {
      next = {
        ...draft,
        documentReadiness: { ...draft.documentReadiness, [action.documentId]: action.value },
      };
      break;
    }
    case 'set-confirmation':
      return {
        ...draft,
        confirmations: { ...draft.confirmations, [action.field]: action.value },
      };
  }
  return {
    ...next,
    confirmations: { informationIsTrue: false, dataProcessingConsent: false },
  };
}

export function reduceApplicationWorkspace(
  state: ApplicationWorkspaceState,
  action: ApplicationDraftAction,
  definition: ApplicationDefinition,
): ApplicationWorkspaceState {
  return {
    draft: reduceApplicationDraft(state.draft, action, definition),
    action: action.type === 'set-confirmation' ? state.action : { status: 'idle' },
  };
}

function selectedAuthority(draft: ApplicationDraft, definition: ApplicationDefinition) {
  return definition.authorities.find(
    (item) => item.id === draft.setup.authorityId && item.jurisdiction === draft.setup.jurisdiction,
  );
}
