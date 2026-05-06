// Customer portal mock data. Documents swapped to live data in Step 14.
// Remaining mocks (registration progress, renewals, comms, payments) are
// replaced in later steps. Signatures kept async so swapping in DB-backed
// implementations is a 1:1 swap.

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

export type PendingInvoice = {
  id: string;
  label: string;
  amount: string;
  dueDate: string;
};

export type PaidInvoice = {
  id: string;
  label: string;
  amount: string;
  paidAt: string;
  status: 'paid' | 'refunded';
};

export type PaymentHistory = {
  pending: PendingInvoice[];
  history: PaidInvoice[];
};

export async function getPaymentHistory(): Promise<PaymentHistory> {
  return {
    pending: [
      { id: 'i1', label: 'License renewal fee', amount: 'AED 1,250.00', dueDate: '2026-05-30' },
      { id: 'i2', label: 'Visa stamping — Mr. Khan', amount: 'AED 850.00', dueDate: '2026-06-10' },
    ],
    history: [
      {
        id: 'h1',
        label: 'Initial registration',
        amount: 'AED 4,200.00',
        paidAt: '2026-04-01',
        status: 'paid',
      },
      {
        id: 'h2',
        label: 'Document attestation',
        amount: 'AED 320.00',
        paidAt: '2026-04-15',
        status: 'paid',
      },
    ],
  };
}
