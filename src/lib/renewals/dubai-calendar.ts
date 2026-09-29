/** Renewal dates are Dubai business dates (UTC+4, no DST); ISO `YYYY-MM-DD` strings. */
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/u;

export type RenewalUrgency = 'overdue' | 'due_today' | 'upcoming';
export type RenewalBucket = 'overdue' | 'this_week' | 'this_month' | 'next_90' | 'later';

export function dubaiBusinessDate(now: Date = new Date()): string {
  return new Date(now.getTime() + 4 * 3_600_000).toISOString().slice(0, 10);
}

function toUtcDay(date: string): number {
  const match = ISO_DATE.exec(date);
  if (!match) throw new Error('INVALID_DATE');
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function addDubaiDays(date: string, days: number): string {
  return new Date(toUtcDay(date) + days * 86_400_000).toISOString().slice(0, 10);
}

export function daysUntil(due: string, today: string): number {
  return Math.round((toUtcDay(due) - toUtcDay(today)) / 86_400_000);
}

export function renewalUrgency(due: string, today: string): RenewalUrgency {
  const days = daysUntil(due, today);
  if (days < 0) return 'overdue';
  if (days === 0) return 'due_today';
  return 'upcoming';
}

/** PRD §15.2 dashboard groups: overdue, this week, this month, next 90 days. */
export function renewalBucket(due: string, today: string): RenewalBucket {
  const days = daysUntil(due, today);
  if (days < 0) return 'overdue';
  if (days <= 7) return 'this_week';
  if (days <= 30) return 'this_month';
  if (days <= 90) return 'next_90';
  return 'later';
}

export type CalendarItem = { id: string; dueDate: string; label: string };
export type RenewalCalendarMonth<T extends CalendarItem> = {
  month: string;
  total: number;
  days: Array<{ date: string; items: T[] }>;
};

export function buildRenewalCalendarMonth<T extends CalendarItem>(
  items: T[],
  month: string,
): RenewalCalendarMonth<T> {
  const match = /^(\d{4})-(\d{2})$/u.exec(month);
  const monthIndex = match ? Number(match[2]) : 0;
  if (!match || monthIndex < 1 || monthIndex > 12) throw new Error('INVALID_CALENDAR_MONTH');
  const first = `${month}-01`;
  const length = new Date(Date.UTC(Number(match[1]), monthIndex, 0)).getUTCDate();
  const inMonth = items
    .filter((item) => item.dueDate.startsWith(`${month}-`))
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate) || a.id.localeCompare(b.id));
  const days = Array.from({ length }, (_, index) => {
    const date = addDubaiDays(first, index);
    return { date, items: inMonth.filter((item) => item.dueDate === date) };
  });
  return { month, total: inMonth.length, days };
}
