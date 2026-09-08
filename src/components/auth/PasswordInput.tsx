'use client';

import { forwardRef, useState } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export const PasswordInput = forwardRef<
  HTMLInputElement,
  Omit<React.ComponentProps<'input'>, 'type'>
>(function PasswordInput({ className, ...props }, ref) {
  const t = useTranslations('auth');
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <Input
        ref={ref}
        type={visible ? 'text' : 'password'}
        className={cn('pe-10', className)}
        {...props}
      />
      <button
        type="button"
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? t('hidePassword') : t('showPassword')}
        aria-pressed={visible}
        className="text-muted-foreground hover:text-foreground focus-visible:ring-ring absolute end-2 top-1/2 -translate-y-1/2 rounded-sm p-1 focus-visible:ring-2 focus-visible:outline-none"
      >
        {visible ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
});
