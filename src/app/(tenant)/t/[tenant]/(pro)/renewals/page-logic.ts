export type RenewalTab = 'active' | 'completed' | 'cancelled';

export function parseRenewalTab(raw: string | undefined): RenewalTab {
  return raw === 'completed' || raw === 'cancelled' ? raw : 'active';
}
