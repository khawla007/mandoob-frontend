export type RenewalUiType = 'license' | 'visa' | 'eid' | 'ejari';

export type Renewal = {
  id: string;
  type: RenewalUiType;
  label: string;
  dueDate: string;
  daysOut: number;
};

export type PastRenewal = {
  id: string;
  type: RenewalUiType;
  label: string;
  completedAt: string;
};
