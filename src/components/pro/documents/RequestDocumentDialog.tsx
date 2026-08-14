'use client';

import { useActionState } from 'react';
import { FilePlus2 } from 'lucide-react';

import {
  requestDocumentCenterAction,
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
import type { DocumentCenterClientOption } from '@/lib/data/pro-document-center';
import { DOC_TYPES } from '@/lib/validation/document';
import { DocumentClientSearchField } from './DocumentClientSearchField';
import type { DocumentActionLabels } from './DocumentActions';

type RequestState = DocumentCenterActionResult<{ requestId: string }> | null;

const fieldClass =
  'border-input bg-background focus-visible:border-ring focus-visible:ring-ring/40 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2';

export function RequestDocumentDialog({
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
  const message = state
    ? state.ok
      ? labels.success
      : (labels.errors[state.messageKey] ?? labels.errors.unexpected)
    : null;

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button type="button" size="lg" className="document-center-control">
          <FilePlus2 aria-hidden="true" />
          {labels.request.trigger}
        </Button>
      </DialogTrigger>
      <DialogContent closeLabel={labels.close} className="document-center-dialog sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{labels.request.title}</DialogTitle>
          <DialogDescription>{labels.request.description}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="document-center-control grid gap-4">
          <DocumentClientSearchField
            slug={slug}
            name="client_id"
            label={labels.request.client}
            labels={labels.clientSearch}
            initialOptions={clients}
            selectedOption={null}
            required
          />
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
          {message ? (
            <p
              role={state?.ok ? 'status' : 'alert'}
              aria-live="polite"
              className={state?.ok ? 'text-sm text-emerald-700' : 'text-destructive text-sm'}
            >
              {message}
            </p>
          ) : null}
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline">
                {labels.cancel}
              </Button>
            </DialogClose>
            <Button disabled={pending} type="submit">
              {pending ? labels.request.pending : labels.request.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
