import type {
  ApplicationActionState,
  ApplicationAdapter,
  ApplicationCompletionInput,
} from './contracts';
import { isValidatedApplicationCompletion } from './validation';

export type DemoApplicationOutcome =
  | 'confirmed-preview'
  | 'duplicate'
  | 'rate-limited'
  | 'unavailable'
  | 'error';

export const productionApplicationAdapter: ApplicationAdapter = {
  async complete() {
    return {
      status: 'unavailable',
      retryable: false,
      message: 'Online submission is not connected yet. No application was sent.',
    };
  },
};

export function createDemoApplicationAdapter(outcome: DemoApplicationOutcome): ApplicationAdapter {
  return {
    async complete(input) {
      return demoResult(outcome, input);
    },
  };
}

function demoResult(
  outcome: DemoApplicationOutcome,
  input: ApplicationCompletionInput,
): Exclude<ApplicationActionState, { status: 'idle' | 'pending' }> {
  if (!isValidatedApplicationCompletion(input)) {
    return {
      status: 'error',
      retryable: false,
      message: 'Complete validation and both confirmations before previewing the application.',
    };
  }
  if (outcome === 'confirmed-preview') {
    return {
      status: 'confirmed-preview',
      confirmation: {
        status: 'confirmed-preview',
        sent: false,
        mode: 'local-preview',
        demoReference: demoReference(input),
        summary: {
          ...input,
          addOnIds: [...input.addOnIds],
        },
      },
    };
  }
  if (outcome === 'duplicate')
    return {
      status: 'duplicate',
      message: 'Synthetic duplicate preview only. No application was sent.',
    };
  if (outcome === 'rate-limited')
    return {
      status: 'rate-limited',
      message: 'Synthetic rate-limit preview only. No application was sent.',
    };
  if (outcome === 'unavailable')
    return {
      status: 'unavailable',
      retryable: false,
      message: 'Synthetic unavailable preview only. No application was sent.',
    };
  return {
    status: 'error',
    retryable: true,
    message: 'The local preview could not be completed. No application was sent.',
  };
}

function demoReference(input: ApplicationCompletionInput) {
  const value = JSON.stringify({
    jurisdiction: input.jurisdiction,
    authorityId: input.authorityId,
    activityId: input.activityId,
    legalStructureId: input.legalStructureId,
    shareholderCount: input.shareholderCount,
    visaCount: input.visaCount,
    officeTypeId: input.officeTypeId,
    addOnIds: [...input.addOnIds].sort(),
    readyDocumentCount: input.readyDocumentCount,
  });
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return `DEMO-${(hash >>> 0).toString(36).toUpperCase().padStart(10, '0').slice(-10)}`;
}
