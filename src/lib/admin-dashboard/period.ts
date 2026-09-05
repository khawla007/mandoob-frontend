import type { DashboardPeriod, DashboardPeriodDays } from './contracts';

const DEFAULT_PERIOD: DashboardPeriodDays = 30;
const ALLOWED_PERIODS = new Set<DashboardPeriodDays>([7, 30, 90]);

export function parseDashboardPeriod(value: string | string[] | undefined): DashboardPeriodDays {
  if (typeof value !== 'string' || !/^\d{1,2}$/u.test(value)) return DEFAULT_PERIOD;
  const days = Number(value) as DashboardPeriodDays;
  return ALLOWED_PERIODS.has(days) ? days : DEFAULT_PERIOD;
}

function dubaiDate(now: Date): string {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Dubai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? '';
  return `${value('year')}-${value('month')}-${value('day')}`;
}

function addDateDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

function dubaiMidnight(date: string): string {
  return new Date(`${date}T00:00:00+04:00`).toISOString();
}

export function resolveDashboardPeriod(
  value: string | string[] | undefined,
  now = new Date(),
): DashboardPeriod {
  const days = parseDashboardPeriod(value);
  const currentEndDateExclusive = addDateDays(dubaiDate(now), 1);
  const currentStartDate = addDateDays(currentEndDateExclusive, -days);
  const comparisonStartDate = addDateDays(currentStartDate, -days);
  return {
    days,
    generatedAt: now.toISOString(),
    current: {
      start: dubaiMidnight(currentStartDate),
      end: dubaiMidnight(currentEndDateExclusive),
      startDate: currentStartDate,
      endDate: addDateDays(currentEndDateExclusive, -1),
    },
    comparison: {
      start: dubaiMidnight(comparisonStartDate),
      end: dubaiMidnight(currentStartDate),
      startDate: comparisonStartDate,
      endDate: addDateDays(currentStartDate, -1),
    },
  };
}
