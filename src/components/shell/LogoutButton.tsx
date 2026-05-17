'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { LogOut } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { postJson } from '@/lib/http/post';

type CommonProps = {
  className?: string;
  onAfterLogout?: () => void;
};

function useLogout(onAfterLogout?: () => void) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    if (loggingOut) return;
    setLoggingOut(true);
    try {
      await postJson('/api/v1/auth/logout', {});
    } finally {
      onAfterLogout?.();
      router.replace('/login');
      router.refresh();
    }
  }

  return { loggingOut, handleLogout };
}

export function LogoutButton({ className, onAfterLogout }: CommonProps) {
  const { loggingOut, handleLogout } = useLogout(onAfterLogout);
  const t = useTranslations('common');
  const label = loggingOut ? `${t('logout')}…` : t('logout');
  return (
    <Button
      variant="ghost"
      size="sm"
      onClick={handleLogout}
      disabled={loggingOut}
      aria-label={t('logout')}
      className={className ?? 'gap-2'}
    >
      <LogOut className="size-4" />
      <span className="hidden sm:inline">{label}</span>
    </Button>
  );
}

export function LogoutMenuItem({ onAfterLogout }: CommonProps) {
  const { loggingOut, handleLogout } = useLogout(onAfterLogout);
  const t = useTranslations('common');
  const label = loggingOut ? `${t('logout')}…` : t('logout');
  return (
    <DropdownMenuItem
      onSelect={(e) => {
        e.preventDefault();
        void handleLogout();
      }}
      disabled={loggingOut}
      className="cursor-pointer"
    >
      <LogOut className="size-4" />
      {label}
    </DropdownMenuItem>
  );
}
