'use client';

import { useRouter } from 'next/navigation';
import { useTransition, useState, useEffect, useRef } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { UsersRoleFilter } from './UsersRoleFilter';
import { UsersStatusFilter } from './UsersStatusFilter';
import { UsersTenantFilter } from './UsersTenantFilter';
import type { Role } from '@/lib/auth/roles';
import type { ProfileStatus } from '@/lib/data/users';
import type { TenantSummary } from '@/lib/data/tenants';

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
  const router = useRouter();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(initialQ);
  const isFirstRender = useRef(true);

  useEffect(() => {
    if (isFirstRender.current) {
      isFirstRender.current = false;
      return;
    }
    const id = setTimeout(() => {
      const fresh = new URLSearchParams(window.location.search);
      fresh.delete('cursor');
      if (q) fresh.set('q', q);
      else fresh.delete('q');
      start(() => router.replace(`/admin/users?${fresh.toString()}`));
    }, 250);
    return () => clearTimeout(id);
  }, [q, router]);

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
