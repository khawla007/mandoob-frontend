'use client';

import { useActionState, useRef, useState } from 'react';
import { Layers3, Plus, Trash2 } from 'lucide-react';

import {
  requestDocumentBatchAction,
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
import { DOC_TYPES, type DocType } from '@/lib/validation/document';
import {
  beginBatchRequest,
  changeBatchRequest,
  completeBatchRequest,
  createBatchRequestState,
} from './batch-request-state';

export const MAX_BATCH_ITEMS = 25;

type BatchItem = {
  key: string;
  doc_type: DocType;
  custom_type_label: string;
  label: string;
  due_at: string;
  notes: string;
};

export type DocumentBatchRequestLabels = {
  trigger: string;
  title: string;
  description: string;
  add: string;
  remove: string;
  item: string;
  customType: string;
  submit: string;
  pending: string;
  success: string;
  maximum: string;
  close: string;
  type: string;
  label: string;
  due: string;
  notes: string;
  docTypes: Record<DocType, string>;
  errors: Record<string, string>;
};

const fieldClass =
  'border-input bg-background focus-visible:border-ring focus-visible:ring-ring/40 h-9 w-full rounded-lg border px-3 text-sm outline-none focus-visible:ring-2';

function newItem(key: string): BatchItem {
  return {
    key,
    doc_type: 'passport',
    custom_type_label: '',
    label: '',
    due_at: '',
    notes: '',
  };
}

export function DocumentBatchRequestDialog({
  slug,
  locale,
  labels,
}: {
  slug: string;
  locale: string;
  labels: DocumentBatchRequestLabels;
}) {
  const operation = useRef(createBatchRequestState());
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<BatchItem[]>(() => [newItem('initial')]);
  const [statusVisible, setStatusVisible] = useState(true);
  const numberFormatter = new Intl.NumberFormat(locale);
  const action = requestDocumentBatchAction.bind(null, slug);
  const [state, formAction, pending] = useActionState<
    DocumentCenterActionResult<{ operationId: string; requestIds: string[] }> | null,
    FormData
  >(async (previous, formData) => {
    setStatusVisible(false);
    operation.current = beginBatchRequest(operation.current, crypto.randomUUID());
    formData.set('operation_id', operation.current.operationId ?? '');
    formData.set(
      'items',
      JSON.stringify(
        items.map((item) => ({
          doc_type: item.doc_type,
          ...(item.doc_type === 'other' ? { custom_type_label: item.custom_type_label } : {}),
          label: item.label,
          due_at: item.due_at,
          notes: item.notes,
        })),
      ),
    );
    const result = await action(previous, formData);
    if (result.ok) {
      operation.current = completeBatchRequest(operation.current);
      setItems([newItem(crypto.randomUUID())]);
    }
    setStatusVisible(true);
    return result;
  }, null);

  function changeItems(update: (current: BatchItem[]) => BatchItem[]) {
    if (pending) return;
    setStatusVisible(false);
    operation.current = changeBatchRequest(operation.current);
    setItems(update);
  }
  const visibleState = pending || !statusVisible ? null : state;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (pending) return;
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button type="button" size="lg" variant="outline">
          <Layers3 aria-hidden="true" />
          {labels.trigger}
        </Button>
      </DialogTrigger>
      <DialogContent
        closeLabel={labels.close}
        className="max-h-[90vh] overflow-y-auto sm:max-w-3xl"
      >
        <DialogHeader>
          <DialogTitle>{labels.title}</DialogTitle>
          <DialogDescription>{labels.description}</DialogDescription>
        </DialogHeader>
        <form action={formAction} className="grid gap-4">
          <div className="grid gap-3">
            {items.map((item, index) => (
              <fieldset
                key={item.key}
                disabled={pending}
                className="grid gap-3 rounded-xl border p-3"
              >
                <legend className="px-1 text-sm font-medium">
                  {labels.item} {numberFormatter.format(index + 1)}
                </legend>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1 text-sm">
                    <span>{labels.type}</span>
                    <select
                      disabled={pending}
                      className={fieldClass}
                      value={item.doc_type}
                      onChange={(event) =>
                        changeItems((current) =>
                          current.map((candidate) =>
                            candidate.key === item.key
                              ? {
                                  ...candidate,
                                  doc_type: event.target.value as DocType,
                                  custom_type_label:
                                    event.target.value === 'other'
                                      ? candidate.custom_type_label
                                      : '',
                                }
                              : candidate,
                          ),
                        )
                      }
                    >
                      {DOC_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {labels.docTypes[type]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {item.doc_type === 'other' ? (
                    <label className="grid gap-1 text-sm">
                      <span>{labels.customType}</span>
                      <input
                        disabled={pending}
                        className={fieldClass}
                        required
                        maxLength={80}
                        value={item.custom_type_label}
                        onChange={(event) =>
                          changeItems((current) =>
                            current.map((candidate) =>
                              candidate.key === item.key
                                ? { ...candidate, custom_type_label: event.target.value }
                                : candidate,
                            ),
                          )
                        }
                      />
                    </label>
                  ) : null}
                  <label className="grid gap-1 text-sm">
                    <span>{labels.label}</span>
                    <input
                      disabled={pending}
                      className={fieldClass}
                      required
                      maxLength={120}
                      value={item.label}
                      onChange={(event) =>
                        changeItems((current) =>
                          current.map((candidate) =>
                            candidate.key === item.key
                              ? { ...candidate, label: event.target.value }
                              : candidate,
                          ),
                        )
                      }
                    />
                  </label>
                  <label className="grid gap-1 text-sm">
                    <span>{labels.due}</span>
                    <input
                      disabled={pending}
                      className={fieldClass}
                      type="date"
                      value={item.due_at}
                      onChange={(event) =>
                        changeItems((current) =>
                          current.map((candidate) =>
                            candidate.key === item.key
                              ? { ...candidate, due_at: event.target.value }
                              : candidate,
                          ),
                        )
                      }
                    />
                  </label>
                </div>
                <label className="grid gap-1 text-sm">
                  <span>{labels.notes}</span>
                  <textarea
                    disabled={pending}
                    className="border-input bg-background focus-visible:border-ring focus-visible:ring-ring/40 min-h-20 rounded-lg border px-3 py-2 text-sm outline-none focus-visible:ring-2"
                    maxLength={500}
                    value={item.notes}
                    onChange={(event) =>
                      changeItems((current) =>
                        current.map((candidate) =>
                          candidate.key === item.key
                            ? { ...candidate, notes: event.target.value }
                            : candidate,
                        ),
                      )
                    }
                  />
                </label>
                {items.length > 1 ? (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="justify-self-end"
                    disabled={pending}
                    onClick={() =>
                      changeItems((current) =>
                        current.filter((candidate) => candidate.key !== item.key),
                      )
                    }
                  >
                    <Trash2 aria-hidden="true" />
                    {labels.remove}
                  </Button>
                ) : null}
              </fieldset>
            ))}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Button
              type="button"
              variant="outline"
              disabled={pending || items.length >= MAX_BATCH_ITEMS}
              onClick={() => changeItems((current) => [...current, newItem(crypto.randomUUID())])}
            >
              <Plus aria-hidden="true" />
              {labels.add}
            </Button>
            <span className="text-muted-foreground text-xs">{labels.maximum}</span>
          </div>
          <div aria-live="polite">
            {visibleState?.ok ? (
              <p role="status" className="text-sm text-[var(--signal-success)]">
                {labels.success}
              </p>
            ) : visibleState ? (
              <p role="alert" className="text-destructive text-sm">
                {labels.errors[visibleState.messageKey] ?? labels.errors.unexpected}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="outline" disabled={pending}>
                {labels.close}
              </Button>
            </DialogClose>
            <Button type="submit" disabled={pending}>
              {pending ? labels.pending : labels.submit}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
