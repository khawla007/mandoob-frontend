'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useTransition, useState, useEffect } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui/input';

const roles = [
  { value: 'all', label: 'All roles' },
  { value: 'super_admin', label: 'Super admin' },
  { value: 'pro', label: 'PRO' },
  { value: 'customer', label: 'Customer' },
  { value: 'employee', label: 'Employee' },
] as const;

export function UsersToolbar() {
  const router = useRouter();
  const params = useSearchParams();
  const [pending, start] = useTransition();
  const [q, setQ] = useState(params.get('q') ?? '');
  const role = params.get('role') ?? 'all';

  useEffect(() => {
    const id = setTimeout(() => {
      const next = new URLSearchParams(params.toString());
      if (q) next.set('q', q);
      else next.delete('q');
      start(() => router.replace(`/admin/users?${next.toString()}`));
    }, 250);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q]);

  function onRoleChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const value = e.target.value;
    const next = new URLSearchParams(params.toString());
    if (value === 'all') next.delete('role');
    else next.set('role', value);
    start(() => router.replace(`/admin/users?${next.toString()}`));
  }

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
      <select
        value={role}
        onChange={onRoleChange}
        className="border-input bg-background ring-offset-background focus-visible:ring-ring h-9 rounded-md border px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none"
        aria-label="Filter by role"
      >
        {roles.map((r) => (
          <option key={r.value} value={r.value}>
            {r.label}
          </option>
        ))}
      </select>
      {pending && <span className="text-muted-foreground text-xs">Loading…</span>}
    </div>
  );
}
