import {
  Ban,
  CalendarX2,
  CircleCheck,
  CirclePause,
  ClockAlert,
  FilePenLine,
  FileSearch,
  Mail,
  Send,
  ShieldCheck,
  ShieldX,
} from 'lucide-react';

import { Badge } from '@/components/ui/badge';
import type { ProCredentialState } from '@/lib/pro-lifecycle/contracts';

export type ProAccountStatus = 'active' | 'invited' | 'disabled' | 'suspended';

const ACCOUNT_STATUS_ICONS = {
  active: CircleCheck,
  invited: Mail,
  disabled: Ban,
  suspended: CirclePause,
} satisfies Record<ProAccountStatus, typeof CircleCheck>;

const ACCOUNT_STATUS_VARIANTS = {
  active: 'default',
  invited: 'secondary',
  disabled: 'outline',
  suspended: 'destructive',
} as const satisfies Record<ProAccountStatus, React.ComponentProps<typeof Badge>['variant']>;

const CREDENTIAL_STATUS_ICONS = {
  draft: FilePenLine,
  submitted: Send,
  under_review: FileSearch,
  verified: ShieldCheck,
  rejected: ShieldX,
  expired: ClockAlert,
  revoked: Ban,
} satisfies Record<ProCredentialState, typeof FilePenLine>;

const CREDENTIAL_STATUS_VARIANTS = {
  draft: 'outline',
  submitted: 'secondary',
  under_review: 'secondary',
  verified: 'default',
  rejected: 'destructive',
  expired: 'outline',
  revoked: 'destructive',
} as const satisfies Record<ProCredentialState, React.ComponentProps<typeof Badge>['variant']>;

const TERM_STATUS_ICONS = {
  draft: FilePenLine,
  active: CircleCheck,
  ended: CalendarX2,
} as const;

const TERM_STATUS_VARIANTS = {
  draft: 'outline',
  active: 'default',
  ended: 'outline',
} as const satisfies Record<
  keyof typeof TERM_STATUS_ICONS,
  React.ComponentProps<typeof Badge>['variant']
>;

export function ProCredentialStatusBadge({
  state,
  label,
}: {
  state: ProCredentialState;
  label: string;
}) {
  const Icon = CREDENTIAL_STATUS_ICONS[state];
  return (
    <Badge variant={CREDENTIAL_STATUS_VARIANTS[state]}>
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}

export function ProAccountStatusBadge({
  status,
  label,
}: {
  status: ProAccountStatus;
  label: string;
}) {
  const Icon = ACCOUNT_STATUS_ICONS[status];
  return (
    <Badge variant={ACCOUNT_STATUS_VARIANTS[status]}>
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}

export function ProTermStatusBadge({
  status,
  label,
}: {
  status: keyof typeof TERM_STATUS_ICONS;
  label: string;
}) {
  const Icon = TERM_STATUS_ICONS[status];
  return (
    <Badge variant={TERM_STATUS_VARIANTS[status]}>
      <Icon aria-hidden />
      {label}
    </Badge>
  );
}
