// Customer portal mock data. Replaced by real data layers in:
//   - Step 11/12: documents
//   - Step 13: renewals
//   - Phase 2: payments, comms
// Signatures kept async so swapping in DB-backed implementations is a 1:1 swap.

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

export type DocRequestStatus = 'requested' | 'uploaded' | 'under_review';
export type ActiveDocRequest = {
  id: string;
  title: string;
  dueDate: string; // ISO
  status: DocRequestStatus;
};

export async function getActiveDocRequests(): Promise<ActiveDocRequest[]> {
  const today = new Date();
  const inDays = (n: number) => new Date(today.getTime() + n * 864e5).toISOString();
  return [
    {
      id: 'd1',
      title: 'Passport copy (all shareholders)',
      dueDate: inDays(2),
      status: 'requested',
    },
    { id: 'd2', title: 'Emirates ID copy', dueDate: inDays(5), status: 'requested' },
    { id: 'd3', title: 'Memorandum of Association draft', dueDate: inDays(7), status: 'uploaded' },
    {
      id: 'd4',
      title: 'Office tenancy contract (Ejari)',
      dueDate: inDays(12),
      status: 'under_review',
    },
  ];
}

export type Renewal = {
  id: string;
  type: 'license' | 'visa' | 'eid' | 'ejari';
  label: string;
  dueDate: string;
  daysOut: number;
};

export async function getUpcomingRenewals(): Promise<Renewal[]> {
  return [
    {
      id: 'r1',
      type: 'license',
      label: 'Trade license — DED-987654',
      dueDate: '2026-09-12',
      daysOut: 132,
    },
    {
      id: 'r2',
      type: 'visa',
      label: 'Investor visa — Mr. Khan',
      dueDate: '2026-07-20',
      daysOut: 78,
    },
    { id: 'r3', type: 'eid', label: 'Emirates ID — Mr. Khan', dueDate: '2026-08-04', daysOut: 93 },
    { id: 'r4', type: 'ejari', label: 'Office Ejari renewal', dueDate: '2026-11-30', daysOut: 211 },
  ];
}

export type PastRenewal = {
  id: string;
  type: Renewal['type'];
  label: string;
  completedAt: string;
};

export async function getPastRenewals(): Promise<PastRenewal[]> {
  return [
    { id: 'pr1', type: 'license', label: 'Trade license renewal 2025', completedAt: '2025-09-12' },
    { id: 'pr2', type: 'eid', label: 'Emirates ID renewal — Mr. Khan', completedAt: '2024-08-04' },
  ];
}

export type Comm = {
  id: string;
  channel: 'email' | 'whatsapp' | 'sms' | 'in_app';
  subject: string;
  sentAt: string;
  fromPro: boolean;
};

export async function getRecentComms(): Promise<Comm[]> {
  const today = new Date();
  const hoursAgo = (h: number) => new Date(today.getTime() - h * 36e5).toISOString();
  return [
    {
      id: 'c1',
      channel: 'email',
      subject: 'MoA draft attached for review',
      sentAt: hoursAgo(3),
      fromPro: true,
    },
    {
      id: 'c2',
      channel: 'whatsapp',
      subject: 'Reminder: passport copies still pending',
      sentAt: hoursAgo(20),
      fromPro: true,
    },
    {
      id: 'c3',
      channel: 'in_app',
      subject: 'Document uploaded — Ejari draft',
      sentAt: hoursAgo(48),
      fromPro: false,
    },
    {
      id: 'c4',
      channel: 'sms',
      subject: 'OTP for license submission',
      sentAt: hoursAgo(96),
      fromPro: true,
    },
  ];
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
