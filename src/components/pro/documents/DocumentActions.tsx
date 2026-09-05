'use client';

import {
  useActionState,
  useEffect,
  useRef,
  useState,
  useTransition,
  type FormEvent,
  type ReactNode,
} from 'react';
import Link from 'next/link';
import { CalendarClock, Check, ExternalLink, UserRound, X } from 'lucide-react';

import {
  openDocumentVersionAction,
  reviewDocumentCenterAction,
  setDocumentExpiryAction,
  type DocumentCenterActionResult,
} from '@/app/(tenant)/t/[tenant]/(pro)/documents/actions';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import type { DocumentCenterRow } from '@/lib/data/pro-document-center';
import type { DocType } from '@/lib/validation/document';
import { VersionHistoryDialog, type VersionHistoryLabels } from './VersionHistoryDialog';
import { resolvePrimaryDocumentAction, resolveReviewFeedbackTarget } from './document-action-state';
import { openDocumentVersionWithPopup } from './document-open-controller';
import {
  beginExpirySubmission,
  createExpiryState,
  settleExpirySubmission,
  syncExpiryProp,
} from './expiry-state';
import { RequestDocumentDialog } from './RequestDocumentDialog';

type MutationState = DocumentCenterActionResult | null;
type DocumentActionRow = Pick<
  DocumentCenterRow,
  'entityKind' | 'documentId' | 'versionId' | 'reviewStatus' | 'expirySource' | 'expiresOn'
>;

export type DocumentActionLabels = {
  close: string;
  cancel: string;
  profile: string;
  open: string;
  opening: string;
  popupBlocked: string;
  success: string;
  request: {
    trigger: string;
    title: string;
    description: string;
    type: string;
    label: string;
    due: string;
    notes: string;
    submit: string;
    pending: string;
  };
  review: {
    approve: string;
    reject: string;
    rejecting: string;
    rejectTitle: string;
    rejectDescription: string;
    note: string;
    approvePending: string;
    rejectPending: string;
  };
  expiry: {
    trigger: string;
    title: string;
    description: string;
    date: string;
    save: string;
    clear: string;
    pending: string;
    externallyManaged: string;
    sources: Record<Exclude<DocumentCenterRow['expirySource'], 'document' | null>, string>;
  };
  docTypes: Record<DocType, string>;
  errors: Record<string, string>;
  history: VersionHistoryLabels;
};

const fieldClass =
  'border-input bg-background focus-visible:border-ring focus-visible:ring-ring/40 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2';

function messageFor(state: MutationState, labels: DocumentActionLabels) {
  if (!state) return null;
  return state.ok ? labels.success : (labels.errors[state.messageKey] ?? labels.errors.unexpected);
}

function ActionFeedback({ state, labels }: { state: MutationState; labels: DocumentActionLabels }) {
  const message = messageFor(state, labels);
  return message ? (
    <p
      role={state?.ok ? 'status' : 'alert'}
      aria-live="polite"
      className={state?.ok ? 'text-sm text-emerald-700' : 'text-destructive text-sm'}
    >
      {message}
    </p>
  ) : null;
}

function PendingButton({
  pending,
  children,
  ...props
}: { pending: boolean; children: ReactNode } & React.ComponentProps<typeof Button>) {
  return (
    <Button disabled={pending} {...props}>
      {children}
    </Button>
  );
}

function RowDocumentActions({
  slug,
  row,
  locale,
  labels,
}: {
  slug: string;
  row: DocumentActionRow;
  locale: string;
  labels: DocumentActionLabels;
}) {
  const reviewAction = reviewDocumentCenterAction.bind(null, slug);
  const expiryAction = setDocumentExpiryAction.bind(null, slug);
  const [reviewState, reviewFormAction, reviewPending] = useActionState<MutationState, FormData>(
    reviewAction,
    null,
  );
  const expiryControl = useRef(createExpiryState(row.expiresOn ?? ''));
  const expirySubmitGuard = useRef(false);
  const [expiryValue, setExpiryValue] = useState(row.expiresOn ?? '');
  const [expiryState, expiryFormAction, expiryPending] = useActionState<MutationState, FormData>(
    async (previousState, formData) => {
      const value = formData.get('expires_on');
      const next = beginExpirySubmission(
        expiryControl.current,
        typeof value === 'string' ? value : '',
      );
      if (!next.accepted) {
        expirySubmitGuard.current = false;
        return previousState;
      }
      expiryControl.current = next.state;
      try {
        const result = await expiryAction(previousState, formData);
        expiryControl.current = settleExpirySubmission(expiryControl.current, result.ok);
        setExpiryValue(expiryControl.current.value);
        expirySubmitGuard.current = false;
        return result;
      } catch (error) {
        expiryControl.current = settleExpirySubmission(expiryControl.current, false);
        expirySubmitGuard.current = false;
        throw error;
      }
    },
    null,
  );
  const [openError, setOpenError] = useState<string | null>(null);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [opening, startOpening] = useTransition();
  const versionId = row.versionId;
  const documentId = row.documentId;
  const expiryFormId = documentId ? `document-expiry-form-${documentId}` : undefined;
  const companyHref = `/t/${encodeURIComponent(slug)}/company`;
  const canManageExpiry = row.entityKind === 'document' && row.expirySource === 'document';
  const externalExpiryLabel =
    row.expirySource && row.expirySource !== 'document'
      ? labels.expiry.sources[row.expirySource]
      : labels.expiry.externallyManaged;
  const primaryAction = resolvePrimaryDocumentAction(row);
  const reviewFeedbackTarget = resolveReviewFeedbackTarget(rejectOpen);

  useEffect(() => {
    expiryControl.current = syncExpiryProp(expiryControl.current, row.expiresOn ?? '');
    setExpiryValue(expiryControl.current.value);
  }, [row.expiresOn]);

  function openCurrentVersion() {
    if (!versionId) return;
    setOpenError(null);
    const request = openDocumentVersionWithPopup({
      openPopup: () => window.open('', '_blank'),
      loadUrl: async () => {
        const result = await openDocumentVersionAction(slug, versionId);
        return result.ok
          ? { ok: true, url: result.data.url }
          : { ok: false, messageKey: result.messageKey };
      },
      onBlocked: () => setOpenError(labels.popupBlocked),
      onFailure: (messageKey) =>
        setOpenError(labels.errors[messageKey] ?? labels.errors.unexpected),
    });
    startOpening(async () => {
      await request;
    });
  }

  function preventCompetingExpirySubmit(event: FormEvent<HTMLFormElement>) {
    if (expirySubmitGuard.current || expiryPending || expiryControl.current.pending) {
      event.preventDefault();
      return;
    }
    expirySubmitGuard.current = true;
  }

  return (
    <div className="flex min-w-52 flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-1">
        {row.reviewStatus === 'pending' && versionId ? (
          <form action={reviewFormAction}>
            <input type="hidden" name="version_id" value={versionId} />
            <input type="hidden" name="status" value="approved" />
            <input type="hidden" name="note" value="" />
            <PendingButton
              pending={reviewPending}
              type="submit"
              size="sm"
              variant={primaryAction === 'approve' ? 'default' : 'outline'}
              data-document-action="approve"
              data-primary={primaryAction === 'approve' ? 'true' : undefined}
            >
              <Check aria-hidden="true" />
              {reviewPending ? labels.review.approvePending : labels.review.approve}
            </PendingButton>
          </form>
        ) : null}

        {row.reviewStatus === 'pending' && versionId ? (
          <Dialog open={rejectOpen} onOpenChange={setRejectOpen}>
            <DialogTrigger asChild>
              <Button type="button" size="sm" variant="destructive" data-document-action="reject">
                <X aria-hidden="true" />
                {labels.review.reject}
              </Button>
            </DialogTrigger>
            <DialogContent closeLabel={labels.close} className="document-center-dialog">
              <DialogHeader>
                <DialogTitle>{labels.review.rejectTitle}</DialogTitle>
                <DialogDescription>{labels.review.rejectDescription}</DialogDescription>
              </DialogHeader>
              <form action={reviewFormAction} className="document-center-control grid gap-4">
                <input type="hidden" name="version_id" value={versionId} />
                <input type="hidden" name="status" value="rejected" />
                <label className="grid gap-1.5 text-sm font-medium">
                  {labels.review.note}
                  <textarea
                    name="note"
                    required
                    minLength={1}
                    maxLength={280}
                    rows={4}
                    className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/40 min-h-24 w-full resize-y rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-2"
                  />
                </label>
                {reviewFeedbackTarget === 'dialog' ? (
                  <ActionFeedback state={reviewState} labels={labels} />
                ) : null}
                <DialogFooter>
                  <DialogClose asChild>
                    <Button type="button" variant="outline">
                      {labels.cancel}
                    </Button>
                  </DialogClose>
                  <PendingButton pending={reviewPending} type="submit" variant="destructive">
                    {reviewPending ? labels.review.rejectPending : labels.review.rejecting}
                  </PendingButton>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        ) : null}

        {versionId ? (
          <Button
            type="button"
            size="sm"
            variant={primaryAction === 'open' ? 'default' : 'outline'}
            disabled={opening}
            onClick={openCurrentVersion}
            data-document-action="open"
            data-primary={primaryAction === 'open' ? 'true' : undefined}
          >
            <ExternalLink aria-hidden="true" />
            {opening ? labels.opening : labels.open}
          </Button>
        ) : null}

        {documentId ? (
          <VersionHistoryDialog
            slug={slug}
            documentId={documentId}
            locale={locale}
            labels={labels.history}
            primary={primaryAction === 'history'}
          />
        ) : null}

        {documentId ? (
          <Dialog>
            <DialogTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="ghost"
                disabled={!canManageExpiry}
                title={!canManageExpiry ? externalExpiryLabel : undefined}
                data-document-action="expiry"
              >
                <CalendarClock aria-hidden="true" />
                {labels.expiry.trigger}
              </Button>
            </DialogTrigger>
            <DialogContent closeLabel={labels.close} className="document-center-dialog">
              <DialogHeader>
                <DialogTitle>{labels.expiry.title}</DialogTitle>
                <DialogDescription>{labels.expiry.description}</DialogDescription>
              </DialogHeader>
              <form
                id={expiryFormId}
                action={expiryFormAction}
                onSubmit={preventCompetingExpirySubmit}
                className="document-center-control grid gap-4"
              >
                <input type="hidden" name="document_id" value={documentId} />
                <label className="grid gap-1.5 text-sm font-medium">
                  {labels.expiry.date}
                  <input
                    name="expires_on"
                    type="date"
                    value={expiryValue}
                    onChange={(event) => setExpiryValue(event.target.value)}
                    disabled={expiryPending}
                    className={fieldClass}
                  />
                </label>
                <ActionFeedback state={expiryState} labels={labels} />
              </form>
              <DialogFooter>
                <form action={expiryFormAction} onSubmit={preventCompetingExpirySubmit}>
                  <input type="hidden" name="document_id" value={documentId} />
                  <input type="hidden" name="expires_on" value="" />
                  <PendingButton pending={expiryPending} type="submit" variant="ghost">
                    {expiryPending ? labels.expiry.pending : labels.expiry.clear}
                  </PendingButton>
                </form>
                <PendingButton pending={expiryPending} type="submit" form={expiryFormId}>
                  {expiryPending ? labels.expiry.pending : labels.expiry.save}
                </PendingButton>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        ) : null}

        <Button
          asChild
          type="button"
          size="sm"
          variant={primaryAction === 'company' ? 'default' : 'ghost'}
          data-document-action="company"
          data-primary={primaryAction === 'company' ? 'true' : undefined}
        >
          <Link href={companyHref}>
            <UserRound aria-hidden="true" />
            {labels.profile}
          </Link>
        </Button>
      </div>
      <div>
        {reviewFeedbackTarget === 'row' ? (
          <ActionFeedback state={reviewState} labels={labels} />
        ) : null}
        {openError ? (
          <p role="alert" className="text-destructive text-xs">
            {openError}
          </p>
        ) : null}
        {!canManageExpiry && documentId ? (
          <p className="text-muted-foreground max-w-60 text-end text-xs">{externalExpiryLabel}</p>
        ) : null}
      </div>
    </div>
  );
}

export function DocumentActions(
  props:
    | {
        kind: 'request';
        slug: string;
        labels: DocumentActionLabels;
      }
    | {
        kind: 'row';
        slug: string;
        row: DocumentActionRow;
        locale: string;
        labels: DocumentActionLabels;
      },
) {
  return props.kind === 'request' ? (
    <RequestDocumentDialog slug={props.slug} labels={props.labels} />
  ) : (
    <RowDocumentActions
      slug={props.slug}
      row={props.row}
      locale={props.locale}
      labels={props.labels}
    />
  );
}
