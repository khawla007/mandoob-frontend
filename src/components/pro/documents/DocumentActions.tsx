'use client';

import { useActionState, useState, useTransition, type ReactNode } from 'react';
import Link from 'next/link';
import { CalendarClock, Check, ExternalLink, FilePlus2, UserRound, X } from 'lucide-react';

import {
  openDocumentVersionAction,
  requestDocumentCenterAction,
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
import type { DocumentCenterClientOption, DocumentCenterRow } from '@/lib/data/pro-document-center';
import { DOC_TYPES, type DocType } from '@/lib/validation/document';
import { VersionHistoryDialog, type VersionHistoryLabels } from './VersionHistoryDialog';
import { resolvePrimaryDocumentAction } from './document-action-state';

type RequestState = DocumentCenterActionResult<{ requestId: string }> | null;
type MutationState = DocumentCenterActionResult | null;
type DocumentActionRow = Pick<
  DocumentCenterRow,
  | 'entityKind'
  | 'clientId'
  | 'documentId'
  | 'versionId'
  | 'reviewStatus'
  | 'expirySource'
  | 'expiresOn'
>;

export type DocumentActionLabels = {
  close: string;
  cancel: string;
  profile: string;
  open: string;
  opening: string;
  success: string;
  request: {
    trigger: string;
    title: string;
    description: string;
    client: string;
    selectClient: string;
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

function messageFor(state: MutationState | RequestState, labels: DocumentActionLabels) {
  if (!state) return null;
  return state.ok ? labels.success : (labels.errors[state.messageKey] ?? labels.errors.unexpected);
}

function ActionFeedback({
  state,
  labels,
}: {
  state: MutationState | RequestState;
  labels: DocumentActionLabels;
}) {
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

function RequestDocumentDialog({
  slug,
  clients,
  labels,
}: {
  slug: string;
  clients: DocumentCenterClientOption[];
  labels: DocumentActionLabels;
}) {
  const requestAction = requestDocumentCenterAction.bind(null, slug);
  const [state, formAction, pending] = useActionState<RequestState, FormData>(requestAction, null);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" size="lg">
          <FilePlus2 aria-hidden="true" />
          {labels.request.trigger}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={labels.close} className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{labels.request.title}</DialogTitle>
          <DialogDescription>{labels.request.description}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <label className="grid gap-1.5 text-sm font-medium">
            {labels.request.client}
            <select name="client_id" required className={fieldClass}>
              <option value="">{labels.request.selectClient}</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {client.companyName}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            {labels.request.type}
            <select name="doc_type" required className={fieldClass}>
              {DOC_TYPES.map((type) => (
                <option key={type} value={type}>
                  {labels.docTypes[type]}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            {labels.request.label}
            <input name="label" required minLength={1} maxLength={120} className={fieldClass} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            {labels.request.due}
            <input name="due_at" type="date" className={fieldClass} />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            {labels.request.notes}
            <textarea
              name="notes"
              maxLength={500}
              rows={4}
              className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/40 min-h-24 w-full resize-y rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-2"
            />
          </label>
          <ActionFeedback state={state} labels={labels} />
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {labels.cancel}
              </Button>
            </DialogClose>
            <PendingButton pending={pending} type="submit">
              {pending ? labels.request.pending : labels.request.submit}
            </PendingButton>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
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
  const clearExpiryAction = setDocumentExpiryAction.bind(null, slug);
  const [reviewState, reviewFormAction, reviewPending] = useActionState<MutationState, FormData>(
    reviewAction,
    null,
  );
  const [expiryState, expiryFormAction, expiryPending] = useActionState<MutationState, FormData>(
    expiryAction,
    null,
  );
  const [clearState, clearFormAction, clearPending] = useActionState<MutationState, FormData>(
    clearExpiryAction,
    null,
  );
  const [openError, setOpenError] = useState<string | null>(null);
  const [opening, startOpening] = useTransition();
  const versionId = row.versionId;
  const documentId = row.documentId;
  const expiryFormId = documentId ? `document-expiry-form-${documentId}` : undefined;
  const clientHref = `/t/${encodeURIComponent(slug)}/clients/${row.clientId}`;
  const canManageExpiry = row.entityKind === 'document' && row.expirySource === 'document';
  const externalExpiryLabel =
    row.expirySource && row.expirySource !== 'document'
      ? labels.expiry.sources[row.expirySource]
      : labels.expiry.externallyManaged;
  const primaryAction = resolvePrimaryDocumentAction(row);

  function openCurrentVersion() {
    if (!versionId) return;
    setOpenError(null);
    startOpening(async () => {
      const result = await openDocumentVersionAction(slug, versionId);
      if (result.ok) {
        window.open(result.data.url, '_blank', 'noopener,noreferrer');
      } else {
        setOpenError(labels.errors[result.messageKey] ?? labels.errors.unexpected);
      }
    });
  }

  return (
    <div className="flex min-w-52 flex-col items-end gap-2">
      <div className="flex flex-wrap justify-end gap-1">
        {row.reviewStatus === 'pending' && versionId ? (
          <form action={reviewFormAction}>
            <input type="hidden" name="version_id" value={versionId} />
            <input type="hidden" name="client_id" value={row.clientId} />
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
          <Dialog>
            <DialogTrigger asChild>
              <Button type="button" size="sm" variant="destructive" data-document-action="reject">
                <X aria-hidden="true" />
                {labels.review.reject}
              </Button>
            </DialogTrigger>
            <DialogContent closeLabel={labels.close}>
              <DialogHeader>
                <DialogTitle>{labels.review.rejectTitle}</DialogTitle>
                <DialogDescription>{labels.review.rejectDescription}</DialogDescription>
              </DialogHeader>
              <form action={reviewFormAction} className="grid gap-4">
                <input type="hidden" name="version_id" value={versionId} />
                <input type="hidden" name="client_id" value={row.clientId} />
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
                <ActionFeedback state={reviewState} labels={labels} />
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
            <DialogContent closeLabel={labels.close}>
              <DialogHeader>
                <DialogTitle>{labels.expiry.title}</DialogTitle>
                <DialogDescription>{labels.expiry.description}</DialogDescription>
              </DialogHeader>
              <form id={expiryFormId} action={expiryFormAction} className="grid gap-4">
                <input type="hidden" name="document_id" value={documentId} />
                <input type="hidden" name="client_id" value={row.clientId} />
                <label className="grid gap-1.5 text-sm font-medium">
                  {labels.expiry.date}
                  <input
                    name="expires_on"
                    type="date"
                    defaultValue={row.expiresOn ?? ''}
                    className={fieldClass}
                  />
                </label>
                <ActionFeedback state={expiryState} labels={labels} />
              </form>
              <ActionFeedback state={clearState} labels={labels} />
              <DialogFooter>
                <form action={clearFormAction}>
                  <input type="hidden" name="document_id" value={documentId} />
                  <input type="hidden" name="client_id" value={row.clientId} />
                  <input type="hidden" name="expires_on" value="" />
                  <PendingButton pending={clearPending} type="submit" variant="ghost">
                    {clearPending ? labels.expiry.pending : labels.expiry.clear}
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
          variant={primaryAction === 'client' ? 'default' : 'ghost'}
          data-document-action="client"
          data-primary={primaryAction === 'client' ? 'true' : undefined}
        >
          <Link href={clientHref}>
            <UserRound aria-hidden="true" />
            {labels.profile}
          </Link>
        </Button>
      </div>
      <div aria-live="polite">
        <ActionFeedback state={reviewState} labels={labels} />
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
        clients: DocumentCenterClientOption[];
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
    <RequestDocumentDialog slug={props.slug} clients={props.clients} labels={props.labels} />
  ) : (
    <RowDocumentActions
      slug={props.slug}
      row={props.row}
      locale={props.locale}
      labels={props.labels}
    />
  );
}
