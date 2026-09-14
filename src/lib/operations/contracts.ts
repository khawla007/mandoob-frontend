export type OperationalSourceState<T> =
  | { status: 'ready'; value: T }
  | { status: 'empty'; value: T }
  | { status: 'partial'; value: Partial<T>; unavailable: string[] }
  | { status: 'unavailable'; reason: string }
  | { status: 'error'; safeMessage: string }
  | { status: 'permission'; reason: string };

export type OperationalActionState =
  | { status: 'idle' }
  | { status: 'pending' }
  | { status: 'success'; message: string }
  | { status: 'validation'; message: string; fields?: Record<string, string> }
  | { status: 'stale'; message: string }
  | { status: 'permission'; reason: string }
  | { status: 'unavailable'; reason: string }
  | { status: 'error'; safeMessage: string };

export type OperationalPriority = 'urgent' | 'warning' | 'active' | 'informational' | 'completed';

export type OperationalTarget =
  | { kind: 'internal'; href: string; consumedContext: Record<string, string> }
  | { kind: 'unavailable'; reason: string };

export type OperationalDomainStatus =
  | {
      domain: 'document';
      value: 'requested' | 'uploaded' | 'pending_review' | 'approved' | 'rejected';
    }
  | { domain: 'renewal'; value: 'upcoming' | 'due_soon' | 'overdue' | 'completed' | 'cancelled' }
  | { domain: 'invoice'; value: 'draft' | 'issued' | 'paid' | 'void' | 'overdue' }
  | { domain: 'payment'; value: 'pending' | 'succeeded' | 'failed' | 'refunded' }
  | {
      domain: 'meeting';
      value: 'open' | 'scheduled' | 'completed' | 'cancelled' | 'no_show' | 'recording_ready';
    }
  | { domain: 'registration'; value: string }
  | { domain: 'onboarding'; value: string };

type OperationalDisplayBase = {
  id: string;
  title: string;
  target: OperationalTarget;
};

export type OperationalDocumentDisplay = OperationalDisplayBase & {
  status: Extract<OperationalDomainStatus, { domain: 'document' }>;
  documentType: string;
  deadline: string | null;
  versionLabel: string | null;
};

export type OperationalRenewalDisplay = OperationalDisplayBase & {
  status: Extract<OperationalDomainStatus, { domain: 'renewal' }>;
  renewalType: string;
  dueDate: string | null;
  requirements: readonly string[];
};

export type OperationalInvoiceDisplay = OperationalDisplayBase & {
  status: Extract<OperationalDomainStatus, { domain: 'invoice' }>;
  amountMinor: number;
  currency: string;
  dueDate: string | null;
  latestPayment: Extract<OperationalDomainStatus, { domain: 'payment' }> | null;
};

export type OperationalCommunicationDisplay = OperationalDisplayBase & {
  direction: 'inbound' | 'outbound';
  channel: 'email' | 'whatsapp' | 'sms' | 'in_app';
  contentPreview: string;
  deliveryStatus: 'unknown' | 'queued' | 'sent' | 'failed';
  occurredAt: string;
};

export type OperationalNotificationDisplay = OperationalDisplayBase & {
  category: string;
  readStatus: 'unread' | 'read';
  createdAt: string;
};

export type OperationalMeetingDisplayContract = OperationalDisplayBase & {
  status: Extract<OperationalDomainStatus, { domain: 'meeting' }>;
  timing: Extract<OperationalCalendarTiming, { kind: 'timestamp' }>;
  joinTarget: OperationalTarget;
  recordingTarget: OperationalTarget;
  consentState: 'recorded' | 'unavailable';
};

export type OperationalWorkItem = {
  id: string;
  domain: OperationalDomainStatus['domain'];
  title: string;
  entityLabel: string;
  reason: string;
  deadline: string | null;
  priority: OperationalPriority;
  priorityReason: string;
  status: OperationalDomainStatus;
  action: OperationalActionState;
  target: OperationalTarget;
};

export type OperationalCalendarTiming =
  | { kind: 'date'; date: string; timeZone: 'Asia/Dubai' }
  | {
      kind: 'timestamp';
      startsAt: string;
      endsAt: string | null;
      timeZone: 'Asia/Dubai';
    };

export type OperationalCalendarEvent = {
  id: string;
  domain: OperationalDomainStatus['domain'];
  title: string;
  timing: OperationalCalendarTiming;
  status: OperationalDomainStatus;
  priority: OperationalPriority;
  target: OperationalTarget;
};

export type OperationalTimelineEvent = {
  id: string;
  domain: 'activity' | 'audit' | 'assignment' | 'onboarding' | 'registration';
  actor: {
    category: 'operator' | 'pro' | 'customer' | 'employee' | 'system';
    display?: string;
  };
  action: string;
  occurredAt: string;
  targetLabel: string;
  detail: Record<string, string>;
  visibility: 'privileged' | 'company' | 'customer' | 'employee';
};

const priorityOrder: Record<OperationalPriority, number> = {
  urgent: 0,
  warning: 1,
  active: 2,
  informational: 3,
  completed: 4,
};

export function compareOperationalWorkItems(
  left: OperationalWorkItem,
  right: OperationalWorkItem,
): number {
  const priority = priorityOrder[left.priority] - priorityOrder[right.priority];
  if (priority !== 0) return priority;
  const deadline = (left.deadline ?? '9999-12-31').localeCompare(right.deadline ?? '9999-12-31');
  return deadline || left.id.localeCompare(right.id);
}

export function createInternalOperationalTarget(
  path: string,
  context: Record<string, string>,
): OperationalTarget | null {
  if (!path.startsWith('/') || path.startsWith('//')) return null;
  if (
    Object.entries(context).some(
      ([key, value]) =>
        !/^[a-z][a-z0-9_-]*$/u.test(key) ||
        !/^[a-zA-Z0-9_:-]+$/u.test(value) ||
        /^javascript:/iu.test(value),
    )
  ) {
    return null;
  }
  const query = new URLSearchParams(context).toString();
  return {
    kind: 'internal',
    href: query ? `${path}?${query}` : path,
    consumedContext: { ...context },
  };
}

export function normalizeCalendarEvent(event: OperationalCalendarEvent): OperationalCalendarEvent {
  if (event.timing.timeZone !== 'Asia/Dubai') throw new Error('Unsupported operational timezone');
  if (event.timing.kind === 'timestamp') {
    const startsAt = Date.parse(event.timing.startsAt);
    const endsAt = event.timing.endsAt === null ? null : Date.parse(event.timing.endsAt);
    if (
      !Number.isFinite(startsAt) ||
      (endsAt !== null && (!Number.isFinite(endsAt) || endsAt < startsAt))
    ) {
      throw new Error('Invalid calendar timestamp');
    }
  }
  return event;
}

const safeTimelineDetailKeys = new Set(['summary', 'reason', 'change']);

export function normalizeTimelineEvents(
  events: readonly OperationalTimelineEvent[],
): OperationalTimelineEvent[] {
  return events
    .map((event) => ({
      ...event,
      detail: Object.fromEntries(
        Object.entries(event.detail).filter(([key]) => safeTimelineDetailKeys.has(key)),
      ),
    }))
    .toSorted(
      (left, right) =>
        Date.parse(right.occurredAt) - Date.parse(left.occurredAt) ||
        left.id.localeCompare(right.id),
    );
}

type PromiseRecord = Record<string, Promise<unknown>>;

export async function settleOperationalSources<T extends PromiseRecord>(
  sources: T,
): Promise<OperationalSourceState<{ [K in keyof T]: Awaited<T[K]> }>> {
  const entries = Object.entries(sources);
  const settled = await Promise.allSettled(entries.map(([, source]) => source));
  const value: Record<string, unknown> = {};
  const unavailable: string[] = [];
  settled.forEach((result, index) => {
    const key = entries[index]?.[0];
    if (!key) return;
    if (result.status === 'fulfilled') value[key] = result.value;
    else unavailable.push(key);
  });
  if (unavailable.length === entries.length) {
    return { status: 'error', safeMessage: 'Operational sources could not be loaded safely.' };
  }
  if (unavailable.length) {
    return { status: 'partial', value, unavailable } as OperationalSourceState<{
      [K in keyof T]: Awaited<T[K]>;
    }>;
  }
  return { status: 'ready', value } as OperationalSourceState<{
    [K in keyof T]: Awaited<T[K]>;
  }>;
}
