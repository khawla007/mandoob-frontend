import type { ProDashboardData } from '@/lib/data/pro-dashboard';
import {
  applicationSignalHref,
  paymentSignalHref,
  renewalSignalHref,
} from '@/lib/signal-studio-filters';

type Event = ProDashboardData['deadlineEvents'][number];
type EventType = Event['eventType'];
type Period = Event['period'];

export type DeadlineDrilldown = {
  key: string;
  type: EventType;
  href: string;
  count: number;
  event?: Event;
};

export function buildDeadlineDrilldowns(
  events: Event[],
  tenantSlug: string,
  date: string,
  period: Period,
): DeadlineDrilldown[] {
  const typed = (type: EventType) => events.filter((event) => event.eventType === type);
  const aggregate = (type: Exclude<EventType, 'document'>, href: string) => {
    const count = typed(type).length;
    return count ? [{ key: type, type, href, count }] : [];
  };
  return [
    ...aggregate('case', applicationSignalHref(tenantSlug, { date, period, eventTypes: 'case' })),
    ...aggregate('renewal', renewalSignalHref(tenantSlug, { tab: 'active', date, period })),
    ...typed('document').map((event, index) => ({
      key: `document:${event.id}:${index}`,
      type: 'document' as const,
      href: event.href,
      count: 1,
      event,
    })),
    ...aggregate('invoice', paymentSignalHref(tenantSlug, { view: 'due-date', date, period })),
  ];
}
