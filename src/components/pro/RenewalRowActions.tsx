'use client';

import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EditRenewalDialog } from '@/components/pro/EditRenewalDialog';
import { RenewalStageDialog, type EvidenceOption } from '@/components/pro/RenewalStageDialog';
import type { RenewalWorkspaceRow } from '@/lib/data/pro-renewal-workspace';

export function RenewalRowActions({
  row,
  slug,
  evidenceOptions = [],
}: {
  row: RenewalWorkspaceRow;
  slug: string;
  evidenceOptions?: EvidenceOption[];
}) {
  const t = useTranslations('pro');
  const p = useTranslations('p308.renewals');
  const [editOpen, setEditOpen] = useState(false);
  const [stageOpen, setStageOpen] = useState(false);
  const isTerminal = row.stage === 'completed' || row.stage === 'cancelled';

  if (isTerminal) return <span className="text-muted-foreground text-xs">{p('terminal')}</span>;
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label={t('renewalActions')}>
            <MoreHorizontal className="size-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => setEditOpen(true)}>{t('renewalEdit')}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => setStageOpen(true)}>
            {p('changeStage')}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <EditRenewalDialog slug={slug} row={row} open={editOpen} onOpenChange={setEditOpen} />
      <RenewalStageDialog
        slug={slug}
        row={row}
        evidenceOptions={evidenceOptions}
        open={stageOpen}
        onOpenChange={setStageOpen}
      />
    </>
  );
}
