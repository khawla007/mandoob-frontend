import type { Role } from '@/lib/auth/roles';
import type { ProfileStatus } from '@/lib/data/users';

type BadgeVariant = 'default' | 'secondary' | 'outline' | 'destructive';

export const roleBadgeVariant: Record<Role, BadgeVariant> = {
  super_admin: 'default',
  admin: 'destructive',
  pro: 'secondary',
  customer: 'outline',
  employee: 'outline',
};

export const statusBadgeVariant: Record<ProfileStatus, BadgeVariant> = {
  active: 'outline',
  invited: 'secondary',
  suspended: 'destructive',
  disabled: 'destructive',
};
