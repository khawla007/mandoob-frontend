'use client';

import { useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { UsersRoleFilter } from './UsersRoleFilter';
import { UsersStatusFilter } from './UsersStatusFilter';
import { UsersTenantFilter } from './UsersTenantFilter';
import type { Role } from '@/lib/auth/roles';
import type { ProfileStatus } from '@/lib/data/users';
import type { TenantSummary } from '@/lib/data/tenants';
import { useListFilterNav } from '@/hooks/use-list-filter-nav';

type StatusValue = ProfileStatus | 'all';

export function UsersToolbar({
  viewerRole,
  tenants,
  initialQ,
  initialRoles,
  initialStatus,
  initialTenant,
}: {
  viewerRole: Role;
  tenants: TenantSummary[];
  initialQ: string;
  initialRoles: Role[];
  initialStatus: StatusValue;
  initialTenant: string | null;
}) {
  const { navigate, pending } = useListFilterNav('/admin/users', { resetKeys: ['cursor'] });
  const [q, setQ] = useState(initialQ);

  useEffect(() => {
    if (q === initialQ) return;
    const id = setTimeout(() => navigate({ q: q || null }), 250);
    return () => clearTimeout(id);
  }, [q, initialQ, navigate]);

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="relative min-w-0 flex-1 sm:max-w-sm">
        <Search className="text-muted-foreground pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search name or email"
          className="pl-8"
          aria-label="Search users"
        />
      </div>
      <UsersRoleFilter viewerRole={viewerRole} initial={initialRoles} />
      <UsersStatusFilter initial={initialStatus} />
      {viewerRole === 'super_admin' && (
        <UsersTenantFilter tenants={tenants} initial={initialTenant} />
      )}
      {pending && <span className="text-muted-foreground text-xs">Loading…</span>}
    </div>
  );
}
