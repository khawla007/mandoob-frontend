'use client';

import type { FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type ErasureDecisionFormsProps = {
  requestId: string;
  canReview: boolean;
  approveLabel: string;
  rejectLabel: string;
  rejectionReasonLabel: string;
  confirmApprove: string;
  confirmReject: string;
  approveAction: (formData: FormData) => Promise<void>;
  rejectAction: (formData: FormData) => Promise<void>;
};

export function ErasureDecisionForms({
  requestId,
  canReview,
  approveLabel,
  rejectLabel,
  rejectionReasonLabel,
  confirmApprove,
  confirmReject,
  approveAction,
  rejectAction,
}: ErasureDecisionFormsProps) {
  function confirmApproval(event: FormEvent<HTMLFormElement>) {
    if (!confirm(confirmApprove)) event.preventDefault();
  }

  function confirmRejection(event: FormEvent<HTMLFormElement>) {
    if (!confirm(confirmReject)) event.preventDefault();
  }

  return (
    <div className="space-y-4">
      <form action={approveAction} onSubmit={confirmApproval}>
        <input type="hidden" name="requestId" value={requestId} />
        <Button type="submit" variant="destructive" disabled={!canReview} className="w-full">
          {approveLabel}
        </Button>
      </form>
      <form action={rejectAction} onSubmit={confirmRejection} className="space-y-3">
        <input type="hidden" name="requestId" value={requestId} />
        <div className="space-y-2">
          <Label htmlFor="rejectionReason">{rejectionReasonLabel}</Label>
          <Textarea
            id="rejectionReason"
            name="rejectionReason"
            rows={4}
            maxLength={1000}
            required
            disabled={!canReview}
          />
        </div>
        <Button type="submit" variant="outline" disabled={!canReview} className="w-full">
          {rejectLabel}
        </Button>
      </form>
    </div>
  );
}
