'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { MoreHorizontal } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EditRenewalDialog } from '@/components/pro/EditRenewalDialog';
import {
  cancelRenewalAction,
  completeRenewalAction,
} from '@/app/(tenant)/t/[tenant]/(pro)/renewals/actions';
import type { RenewalWorkspaceRow } from '@/lib/data/pro-renewal-workspace';

export function RenewalRowActions({ row, slug }: { row: RenewalWorkspaceRow; slug: string }) {
  const router = useRouter();
  const t = useTranslations('pro');
  const [pending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);
  const [cancelConfirmationOpen, setCancelConfirmationOpen] = useState(false);

  const isTerminal = row.status === 'completed' || row.status === 'cancelled';

  function onComplete() {
    startTransition(async () => {
      const result = await completeRenewalAction(slug, row.id);
      if (!result.ok) {
        toast.error(t('renewalActionFailed'));
        return;
      }
      toast.success(t('renewalCompletedConfirmation'));
      router.refresh();
    });
  }

  function onCancel() {
    startTransition(async () => {
      const result = await cancelRenewalAction(slug, row.id);
      if (!result.ok) {
        toast.error(t('renewalActionFailed'));
        return;
      }
      setCancelConfirmationOpen(false);
      toast.success(t('renewalCancelledConfirmation'));
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" disabled={pending} aria-label={t('renewalActions')}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>{t('renewalEdit')}</DropdownMenuItem>
          {!isTerminal && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onComplete}>{t('renewalMarkCompleted')}</DropdownMenuItem>
              <DropdownMenuItem
                onSelect={() => setCancelConfirmationOpen(true)}
                className="text-destructive"
              >
                {t('renewalCancel')}
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {cancelConfirmationOpen ? (
        <div className="mt-2 flex flex-col items-end gap-2" role="alert">
          <p className="text-muted-foreground text-xs">{t('renewalCancelPrompt')}</p>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCancelConfirmationOpen(false)}
              disabled={pending}
            >
              {t('renewalKeep')}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={onCancel}
              disabled={pending}
            >
              {t('renewalConfirmCancel')}
            </Button>
          </div>
        </div>
      ) : null}
      <EditRenewalDialog slug={slug} row={row} open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}
