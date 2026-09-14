export type ContactTopic = 'pro-interest';

export function resolveContactTopic(
  value: string | string[] | undefined,
): ContactTopic | undefined {
  return value === 'pro-interest' ? value : undefined;
}
