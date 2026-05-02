'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Label } from '@/components/ui/label';
import { postJson } from '@/lib/http/post';
import type { ProfileStatus } from '@/lib/data/admin-edit-helpers';

type Transition = { value: 'active' | 'suspended' | 'disabled'; label: string };

const ALLOWED_TRANSITIONS: Record<ProfileStatus, Transition[]> = {
  active: [
    { value: 'suspended', label: 'Suspend (reversible, requires reason)' },
    { value: 'disabled', label: 'Disable (terminal)' },
  ],
  suspended: [
    { value: 'active', label: 'Reactivate' },
    { value: 'disabled', label: 'Disable (terminal)' },
  ],
  invited: [{ value: 'disabled', label: 'Cancel pending invite' }],
  disabled: [],
};

export function ChangeStatusPanel({
  userId,
  currentStatus,
}: {
  userId: string;
  currentStatus: ProfileStatus;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newStatus, setNewStatus] = useState<Transition['value'] | ''>('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const options = ALLOWED_TRANSITIONS[currentStatus];

  async function submit() {
    if (!newStatus) {
      setError('Pick a target status.');
      return;
    }
    if (newStatus === 'suspended' && reason.trim().length === 0) {
      setError('Reason is required when suspending.');
      return;
    }
    setError(null);
    setSubmitting(true);
    const body =
      newStatus === 'suspended'
        ? { newStatus, reason: reason.trim() }
        : newStatus === 'disabled' && reason.trim().length
          ? { newStatus, reason: reason.trim() }
          : { newStatus };
    const res = await postJson(`/api/v1/admin/users/${userId}/status`, body);
    setSubmitting(false);
    if (res.ok) {
      setOpen(false);
      setNewStatus('');
      setReason('');
      router.refresh();
      return;
    }
    let payload: { error?: string; code?: string } = {};
    try {
      payload = await res.json();
    } catch {
      // ignore
    }
    setError(payload.error ?? `Request failed (${res.status})`);
  }

  if (options.length === 0) {
    return (
      <div className="text-muted-foreground text-sm">
        No status changes available — user is {currentStatus}.
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Change status</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Change account status</DialogTitle>
          <DialogDescription>
            Current status: {currentStatus}. Suspended and disabled both revoke active sessions.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Cannot change status</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label>Target status</Label>
            <Select value={newStatus} onValueChange={(v) => setNewStatus(v as never)}>
              <SelectTrigger>
                <SelectValue placeholder="Choose target status" />
              </SelectTrigger>
              <SelectContent>
                {options.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {(newStatus === 'suspended' || newStatus === 'disabled') && (
            <div className="space-y-2">
              <Label>Reason {newStatus === 'suspended' ? '(required)' : '(optional)'}</Label>
              <Textarea
                rows={3}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                maxLength={500}
              />
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? 'Saving…' : 'Apply'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
