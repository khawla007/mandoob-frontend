import { Badge } from '@/components/ui/badge';
import type { RenewalSource, RenewalStatus, RenewalType } from '@/lib/data/renewals';
import {
  RENEWAL_STATUS_LABEL,
  RENEWAL_STATUS_VARIANT,
  RENEWAL_TYPE_LABEL,
} from './renewal-badge-maps';

export {
  RENEWAL_STATUS_LABEL,
  RENEWAL_STATUS_VARIANT,
  RENEWAL_TYPE_LABEL,
} from './renewal-badge-maps';

export function RenewalTypeBadge({ type }: { type: RenewalType }) {
  return <Badge variant="outline">{RENEWAL_TYPE_LABEL[type]}</Badge>;
}

export function RenewalStatusBadge({ status }: { status: RenewalStatus }) {
  const variant = RENEWAL_STATUS_VARIANT[status];
  const className = status === 'due_soon' ? 'bg-amber-500 text-white hover:bg-amber-500' : '';
  return (
    <Badge variant={variant} className={className}>
      {RENEWAL_STATUS_LABEL[status]}
    </Badge>
  );
}

export function RenewalSourceBadge({ source }: { source: RenewalSource }) {
  return (
    <Badge variant="outline" className="text-muted-foreground text-xs">
      {source === 'license_backfill' ? 'Auto' : 'Manual'}
    </Badge>
  );
}
