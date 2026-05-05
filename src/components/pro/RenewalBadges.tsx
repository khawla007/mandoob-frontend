import { Badge } from '@/components/ui/badge';
import type { RenewalSource, RenewalStatus, RenewalType } from '@/lib/data/renewals';

export const RENEWAL_TYPE_LABEL: Record<RenewalType, string> = {
  license: 'License',
  visa: 'Visa',
  eid: 'EID',
  ejari: 'Ejari',
};

export const RENEWAL_STATUS_LABEL: Record<RenewalStatus, string> = {
  upcoming: 'Upcoming',
  due_soon: 'Due soon',
  overdue: 'Overdue',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

export const RENEWAL_STATUS_VARIANT: Record<
  RenewalStatus,
  'default' | 'secondary' | 'destructive' | 'outline'
> = {
  upcoming: 'secondary',
  due_soon: 'secondary',
  overdue: 'destructive',
  completed: 'default',
  cancelled: 'outline',
};

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
