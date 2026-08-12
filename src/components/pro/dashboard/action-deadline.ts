import { signalLabel } from './widget-format';

export type ActionCountdownLabels = {
  breached: string;
  today: string;
  minutes: string;
  hours: string;
  days: string;
};

export function formatActionCountdown(
  deadline: string,
  generatedAt: string,
  locale: string,
  labels: ActionCountdownLabels,
): string {
  const deadlineTimestamp = Date.parse(
    deadline.length === 10 ? `${deadline}T19:59:59.999Z` : deadline,
  );
  const difference = deadlineTimestamp - Date.parse(generatedAt);
  if (difference < 0) return labels.breached;
  if (difference === 0) return labels.today;
  const minutes = Math.ceil(difference / 60_000);
  const hours = Math.ceil(difference / 3_600_000);
  const number = new Intl.NumberFormat(locale);
  if (minutes < 60) return signalLabel(labels.minutes, { count: number.format(minutes) });
  if (hours < 24) return signalLabel(labels.hours, { count: number.format(hours) });
  return signalLabel(labels.days, { count: number.format(Math.ceil(hours / 24)) });
}
