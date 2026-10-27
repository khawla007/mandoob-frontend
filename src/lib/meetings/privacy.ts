const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function redactMeetingTranscript(value: string): string {
  return value
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/gu, '[EMAIL_REDACTED]')
    .replace(/\b784-?\d{4}-?\d{7}-?\d\b/gu, '[UAE_ID_REDACTED]')
    .replace(/(?:\+971|00971|0)\s*5\d(?:[\s-]*\d){7}\b/gu, '[PHONE_REDACTED]')
    .slice(0, 200_000)
    .trim();
}

export function transcriptRetentionDeadline(now = new Date()): string {
  return new Date(now.getTime() + THIRTY_DAYS_MS).toISOString();
}
