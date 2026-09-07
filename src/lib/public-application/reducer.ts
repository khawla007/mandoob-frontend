import type {
  ApplicationDefinition,
  ApplicationDraft,
  ApplicationWorkspaceState,
} from './contracts';
import { emptyShareholder } from './definition';
import { applicationDocumentReadinessKeys } from './document-readiness';

export type ApplicationDraftAction =
  | {
      type: 'set-contact-field';
      field: keyof ApplicationDraft['contact'];
      value: string;
    }
  | { type: 'set-business-summary'; value: string }
  | { type: 'set-preferred-name'; index: 0 | 1 | 2; value: string }
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
  | { type: 'set-add-ons'; value: readonly string[] }
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
    case 'set-contact-field':
      if (draft.contact[action.field] === action.value) return draft;
      next = { ...draft, contact: { ...draft.contact, [action.field]: action.value } };
      break;
    case 'set-business-summary':
      if (draft.business.summary === action.value) return draft;
      next = { ...draft, business: { ...draft.business, summary: action.value } };
      break;
    case 'set-preferred-name': {
      if (draft.business.preferredNames[action.index] === action.value) return draft;
      const preferredNames = [...draft.business.preferredNames] as [string, string, string];
      preferredNames[action.index] = action.value;
      next = { ...draft, business: { ...draft.business, preferredNames } };
      break;
    }
    case 'set-jurisdiction': {
      if (draft.setup.jurisdiction === action.value) return draft;
      const candidates = definition.authorities.filter(
        (authority) => authority.jurisdiction === action.value,
      );
      const activityId = definition.activities.some(
        (activity) =>
          activity.id === draft.business.activityId &&
          action.value !== null &&
          activity.jurisdictions.includes(action.value),
      )
        ? draft.business.activityId
        : null;
      const legalStructureId = candidates.some((authority) =>
        authority.legalStructureIds.includes(draft.setup.legalStructureId!),
      )
        ? draft.setup.legalStructureId
        : null;
      const officeTypeId = candidates.some((authority) =>
        authority.officeTypeIds.includes(draft.setup.officeTypeId!),
      )
        ? draft.setup.officeTypeId
        : null;
      const addOnIds = draft.setup.addOnIds.filter((id) =>
        candidates.some((authority) => authority.addOnIds.includes(id)),
      );
      const visaTotal = visaTotalForDraft(draft);
      const keepVisas = candidates.some(
        (authority) =>
          visaTotal !== null &&
          visaTotal >= authority.visaRange.min &&
          visaTotal <= authority.visaRange.max,
      );
      next = {
        ...draft,
        business: { ...draft.business, activityId },
        setup: {
          jurisdiction: action.value,
          authorityId: null,
          legalStructureId,
          officeTypeId,
          officeNotes: officeTypeId ? draft.setup.officeNotes : '',
          addOnIds,
        },
        visas: keepVisas ? draft.visas : { ...emptyVisas },
        documentReadiness: {},
      };
      break;
    }
    case 'set-authority': {
      if (draft.setup.authorityId === action.value) return draft;
      const authority = definition.authorities.find(
        (item) => item.id === action.value && item.jurisdiction === draft.setup.jurisdiction,
      );
      const activityId = authority?.activityIds.includes(draft.business.activityId ?? '')
        ? draft.business.activityId
        : null;
      const legalStructureId = authority?.legalStructureIds.includes(draft.setup.legalStructureId!)
        ? draft.setup.legalStructureId
        : null;
      const officeTypeId = authority?.officeTypeIds.includes(draft.setup.officeTypeId!)
        ? draft.setup.officeTypeId
        : null;
      const visaTotal = visaTotalForDraft(draft);
      const keepVisas =
        authority &&
        visaTotal !== null &&
        visaTotal >= authority.visaRange.min &&
        visaTotal <= authority.visaRange.max;
      next = {
        ...draft,
        business: { ...draft.business, activityId },
        setup: {
          ...draft.setup,
          authorityId: authority?.id ?? null,
          legalStructureId,
          officeTypeId,
          officeNotes: officeTypeId ? draft.setup.officeNotes : '',
          addOnIds: draft.setup.addOnIds.filter((id) => authority?.addOnIds.includes(id)),
        },
        visas: keepVisas ? draft.visas : { ...emptyVisas },
        documentReadiness: {},
      };
      break;
    }
    case 'set-activity': {
      if (draft.business.activityId === action.value) return draft;
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
      if (draft.setup.legalStructureId === action.value) return draft;
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
      if (draft.visas.required === action.value) return draft;
      next = {
        ...draft,
        visas: action.value
          ? { ...emptyVisas, required: true }
          : { ...emptyVisas, required: false },
        documentReadiness: {},
      };
      break;
    case 'set-visa-count':
      if (draft.visas[action.field] === action.value) return draft;
      next = {
        ...draft,
        visas: { ...draft.visas, [action.field]: action.value },
        documentReadiness: {},
      };
      break;
    case 'set-office-type': {
      if (draft.setup.officeTypeId === action.value) return draft;
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
      if (draft.setup.officeNotes === action.value) return draft;
      next = { ...draft, setup: { ...draft.setup, officeNotes: action.value } };
      break;
    case 'set-add-ons': {
      const authority = selectedAuthority(draft, definition);
      const addOnIds = action.value.filter((id) => authority?.addOnIds.includes(id));
      if (sameStrings(draft.setup.addOnIds, addOnIds)) return draft;
      next = {
        ...draft,
        setup: {
          ...draft.setup,
          addOnIds,
        },
        documentReadiness: {},
      };
      break;
    }
    case 'set-shareholder-count': {
      if (draft.shareholders.length === action.value) return draft;
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
    case 'set-shareholder-field': {
      const shareholder = draft.shareholders.find((row) => row.id === action.shareholderId);
      if (!shareholder || shareholder[action.field] === action.value) return draft;
      next = {
        ...draft,
        shareholders: draft.shareholders.map((row) =>
          row.id === action.shareholderId ? { ...row, [action.field]: action.value } : row,
        ),
        documentReadiness: {},
      };
      break;
    }
    case 'set-document-readiness': {
      const allowedKeys = applicationDocumentReadinessKeys(draft, definition);
      if (!allowedKeys.has(action.documentId)) return draft;
      const documentReadiness = Object.fromEntries(
        Object.entries(draft.documentReadiness).filter(([key]) => allowedKeys.has(key)),
      );
      if (
        draft.documentReadiness[action.documentId] === action.value &&
        Object.keys(documentReadiness).length === Object.keys(draft.documentReadiness).length
      )
        return draft;
      next = {
        ...draft,
        documentReadiness: { ...documentReadiness, [action.documentId]: action.value },
      };
      break;
    }
    case 'set-confirmation':
      if (draft.confirmations[action.field] === action.value) return draft;
      if (!action.value) {
        return {
          ...draft,
          confirmations: { informationIsTrue: false, dataProcessingConsent: false },
        };
      }
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

function sameStrings(left: readonly string[], right: readonly string[]) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function reduceApplicationWorkspace(
  state: ApplicationWorkspaceState,
  action: ApplicationDraftAction,
  definition: ApplicationDefinition,
): ApplicationWorkspaceState {
  const draft = reduceApplicationDraft(state.draft, action, definition);
  if (draft === state.draft) return state;
  return {
    draft,
    action: action.type === 'set-confirmation' && action.value ? state.action : { status: 'idle' },
  };
}

function visaTotalForDraft(draft: ApplicationDraft) {
  if (draft.visas.required === false) return 0;
  if (draft.visas.required !== true) return null;
  const values = [draft.visas.investorCount, draft.visas.employeeCount, draft.visas.familyCount];
  if (values.some((value) => !/^(0|[1-9]\d*)$/u.test(value))) return null;
  return values.reduce((total, value) => total + Number(value), 0);
}

function selectedAuthority(draft: ApplicationDraft, definition: ApplicationDefinition) {
  return definition.authorities.find(
    (item) => item.id === draft.setup.authorityId && item.jurisdiction === draft.setup.jurisdiction,
  );
}
