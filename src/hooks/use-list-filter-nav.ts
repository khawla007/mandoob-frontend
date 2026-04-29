'use client';

import { useRouter } from 'next/navigation';
import { useTransition } from 'react';

export type FilterUpdate = Record<string, string | null | undefined>;

export function useListFilterNav(basePath: string, options?: { resetKeys?: string[] }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const resetKeys = options?.resetKeys ?? [];

  function navigate(updates: FilterUpdate) {
    const fresh = new URLSearchParams(window.location.search);
    for (const key of resetKeys) fresh.delete(key);
    for (const [key, value] of Object.entries(updates)) {
      if (value === null || value === undefined || value === '') fresh.delete(key);
      else fresh.set(key, value);
    }
    const qs = fresh.toString();
    start(() => router.replace(qs ? `${basePath}?${qs}` : basePath));
  }

  return { navigate, pending };
}
