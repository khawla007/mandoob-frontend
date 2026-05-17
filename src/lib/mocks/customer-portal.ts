// Customer portal mock data. Documents swapped to live data in Step 14.
// Comms swapped in Step 20. Payments swapped in Step 21.
// Only registration progress remains mocked — Step 24 replaces it with the
// public-funnel-derived stage data. Signatures kept async so swapping in
// DB-backed implementations is a 1:1 swap.

export type RegistrationStageKey =
  | 'onboarding'
  | 'documents_requested'
  | 'under_review'
  | 'approved'
  | 'active';

export type RegistrationStage = {
  key: RegistrationStageKey;
  label: string;
  state: 'done' | 'current' | 'pending';
};

export type RegistrationProgress = {
  stages: RegistrationStage[];
  currentStage: RegistrationStageKey;
};

export async function getRegistrationProgress(): Promise<RegistrationProgress> {
  return {
    currentStage: 'documents_requested',
    stages: [
      { key: 'onboarding', label: 'Onboarding', state: 'done' },
      { key: 'documents_requested', label: 'Documents requested', state: 'current' },
      { key: 'under_review', label: 'Under review', state: 'pending' },
      { key: 'approved', label: 'Approved', state: 'pending' },
      { key: 'active', label: 'Active', state: 'pending' },
    ],
  };
}
