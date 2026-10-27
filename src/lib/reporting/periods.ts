export type DubaiReportingPeriod = {
  businessTimezone: 'Asia/Dubai';
  startInclusive: string;
  endExclusive: string;
  label: string;
};

export function buildDubaiMonthPeriod(value: string): DubaiReportingPeriod {
  const match = /^(\d{4})-(0[1-9]|1[0-2])$/u.exec(value);
  if (!match) throw new Error('Invalid reporting month');
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  const start = new Date(Date.UTC(year, monthIndex, 1, -4));
  const end = new Date(Date.UTC(year, monthIndex + 1, 1, -4));
  return {
    businessTimezone: 'Asia/Dubai',
    startInclusive: start.toISOString(),
    endExclusive: end.toISOString(),
    label: value,
  };
}
