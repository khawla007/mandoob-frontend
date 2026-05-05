'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
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
import type { RenewalRow } from '@/lib/data/renewals';

export function RenewalRowActions({ row, slug }: { row: RenewalRow; slug: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [editOpen, setEditOpen] = useState(false);

  const isTerminal = row.status === 'completed' || row.status === 'cancelled';

  function onComplete() {
    startTransition(async () => {
      const result = await completeRenewalAction(slug, row.id);
      if (!result.ok) {
        toast.error(`${result.code}: ${result.error}`);
        return;
      }
      toast.success('Renewal marked completed');
      router.refresh();
    });
  }

  function onCancel() {
    startTransition(async () => {
      const result = await cancelRenewalAction(slug, row.id);
      if (!result.ok) {
        toast.error(`${result.code}: ${result.error}`);
        return;
      }
      toast.success('Renewal cancelled');
      router.refresh();
    });
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" disabled={pending} aria-label="Renewal actions">
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>Edit</DropdownMenuItem>
          {!isTerminal && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={onComplete}>Mark completed</DropdownMenuItem>
              <DropdownMenuItem onSelect={onCancel} className="text-destructive">
                Cancel renewal
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <EditRenewalDialog slug={slug} row={row} open={editOpen} onOpenChange={setEditOpen} />
    </>
  );
}
