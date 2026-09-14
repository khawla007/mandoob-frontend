import { isValidCalendarDate } from '@/lib/validation/calendar-date';

type SearchValue = string | string[] | undefined;
type SearchRecord = Record<string, SearchValue>;

const taskDomains = [
  'all',
  'document',
  'renewal',
  'invoice',
  'meeting',
  'onboarding',
  'registration',
] as const;
const priorities = ['all', 'urgent', 'warning', 'active', 'informational', 'completed'] as const;
const taskStatuses = ['all', 'open', 'blocked', 'completed'] as const;
const calendarViews = ['list', 'month', 'day'] as const;
const calendarTypes = [
  'all',
  'document',
  'renewal',
  'invoice',
  'meeting',
  'onboarding',
  'registration',
] as const;
const calendarStatuses = ['all', 'scheduled', 'due', 'overdue', 'completed', 'cancelled'] as const;

function scalar(value: SearchValue): string | null {
  return typeof value === 'string' ? value : null;
}

function member<const T extends readonly string[]>(
  value: SearchValue,
  values: T,
  fallback: T[number],
) {
  const candidate = scalar(value);
  return candidate !== null && values.includes(candidate) ? (candidate as T[number]) : fallback;
}

export type TaskSearch = {
  domain: (typeof taskDomains)[number];
  priority: (typeof priorities)[number];
  status: (typeof taskStatuses)[number];
  page: number;
};

export function parseTaskSearch(search: SearchRecord): TaskSearch {
  const rawPage = scalar(search.page);
  const page = rawPage && /^[1-9]\d*$/u.test(rawPage) ? Number(rawPage) : 1;
  return {
    domain: member(search.domain, taskDomains, 'all'),
    priority: member(search.priority, priorities, 'all'),
    status: member(search.status, taskStatuses, 'all'),
    page: Number.isSafeInteger(page) ? page : 1,
  };
}

export function buildTaskHref(base: string, search: TaskSearch): string {
  const query = new URLSearchParams();
  if (search.domain !== 'all') query.set('domain', search.domain);
  if (search.priority !== 'all') query.set('priority', search.priority);
  if (search.status !== 'all') query.set('status', search.status);
  if (search.page > 1) query.set('page', String(search.page));
  const value = query.toString();
  return value ? `${base}?${value}` : base;
}

export type CalendarSearch = {
  view: (typeof calendarViews)[number];
  date: string | null;
  type: (typeof calendarTypes)[number];
  status: (typeof calendarStatuses)[number];
};

export function parseCalendarSearch(search: SearchRecord): CalendarSearch {
  const date = scalar(search.date);
  return {
    view: member(search.view, calendarViews, 'list'),
    date: date !== null && isValidCalendarDate(date) ? date : null,
    type: member(search.type, calendarTypes, 'all'),
    status: member(search.status, calendarStatuses, 'all'),
  };
}

export function buildCalendarHref(base: string, search: CalendarSearch): string {
  const query = new URLSearchParams();
  if (search.view !== 'list') query.set('view', search.view);
  if (search.date) query.set('date', search.date);
  if (search.type !== 'all') query.set('type', search.type);
  if (search.status !== 'all') query.set('status', search.status);
  const value = query.toString();
  return value ? `${base}?${value}` : base;
}
