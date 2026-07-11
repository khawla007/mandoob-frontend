'use client';

import { useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { MoreHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  changeMemberRoleAction,
  setMemberStatusAction,
  resendMemberInviteAction,
} from '@/app/(tenant)/t/[tenant]/(pro)/team/actions';

type Status = 'active' | 'invited' | 'suspended' | 'disabled';

export function TeamRowActions({
  slug,
  targetId,
  targetRole,
  targetStatus,
  callerId,
  isLastActiveAdmin,
}: {
  slug: string;
  targetId: string;
  targetRole: 'pro' | 'admin';
  targetStatus: Status;
  callerId: string;
  isLastActiveAdmin: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  function call(thunk: () => Promise<{ ok: boolean; error?: string; code?: string }>) {
    startTransition(async () => {
      const res = await thunk();
      if (!res.ok) {
        // Use a console fallback; tenant team actions return readable codes that
        // surface in the alert when wired into a future toast layer.
        console.warn('team action failed', res.code, res.error);
        alert(`${res.code ?? 'ERROR'}: ${res.error ?? 'Action failed'}`);
        return;
      }
      router.refresh();
    });
  }

  const isSelf = targetId === callerId;
  const newRole: 'pro' | 'admin' = targetRole === 'admin' ? 'pro' : 'admin';
  const demoteBlocked = targetRole === 'admin' && isLastActiveAdmin;
  const suspendBlocked = isSelf || (targetRole === 'admin' && isLastActiveAdmin);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" disabled={pending} aria-label="Member actions">
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem
          disabled={demoteBlocked}
          onSelect={() =>
            call(() =>
              changeMemberRoleAction(slug, {
                target_id: targetId,
                new_role: newRole,
              }),
            )
          }
        >
          {targetRole === 'admin' ? 'Demote to PRO' : 'Promote to admin'}
        </DropdownMenuItem>

        {targetStatus === 'active' && (
          <DropdownMenuItem
            disabled={suspendBlocked}
            onSelect={() =>
              call(() =>
                setMemberStatusAction(slug, {
                  target_id: targetId,
                  new_status: 'suspended',
                }),
              )
            }
          >
            Suspend
          </DropdownMenuItem>
        )}
        {targetStatus === 'suspended' && (
          <DropdownMenuItem
            onSelect={() =>
              call(() =>
                setMemberStatusAction(slug, {
                  target_id: targetId,
                  new_status: 'active',
                }),
              )
            }
          >
            Reactivate
          </DropdownMenuItem>
        )}

        {targetStatus === 'invited' && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => call(() => resendMemberInviteAction(slug, { target_id: targetId }))}
            >
              Resend invite
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
