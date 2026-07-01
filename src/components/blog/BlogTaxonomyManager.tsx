'use client';

import { useState, useTransition, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { CheckCircle2, Pencil, Plus, Trash2 } from 'lucide-react';
import { saveBlogTermAction, deleteBlogTermAction } from '@/app/admin/blog/actions';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import type { BlogTerm } from '@/lib/data/blog';
import type { BlogTermKind } from '@/lib/validation/blog';

const kindLabels: Record<BlogTermKind, string> = {
  category: 'Category',
  attribute: 'Attribute',
  tag: 'Tag',
};

type BlogTaxonomyManagerProps = {
  kind: BlogTermKind;
  terms: BlogTerm[];
};

type StatusMessage = {
  type: 'success' | 'error';
  title: string;
  description: string;
};

export function BlogTaxonomyManager({ kind, terms }: BlogTaxonomyManagerProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<StatusMessage | null>(null);
  const label = kindLabels[kind];
  const emptyLabel = label.toLowerCase();

  function submitSave(id: string | null, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    setMessage(null);

    startTransition(async () => {
      const result = await saveBlogTermAction(id, formData);
      if (!result.ok) {
        setMessage({
          type: 'error',
          title: `Could not save ${emptyLabel}`,
          description: `${result.code}: ${result.error}`,
        });
        return;
      }

      if (!id) form.reset();
      setMessage({
        type: 'success',
        title: id ? `${label} saved` : `${label} added`,
        description: id ? `${emptyLabel} changes were saved.` : `The new ${emptyLabel} was added.`,
      });
      router.refresh();
    });
  }

  function submitDelete(term: BlogTerm, event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const confirmed = window.confirm(
      `Delete "${term.name}"? This removes the ${emptyLabel} from any associated blog posts.`,
    );
    if (!confirmed) return;

    setMessage(null);
    startTransition(async () => {
      const result = await deleteBlogTermAction(term.id);
      if (!result.ok) {
        setMessage({
          type: 'error',
          title: `Could not delete ${emptyLabel}`,
          description: `${result.code}: ${result.error}`,
        });
        return;
      }

      setMessage({
        type: 'success',
        title: `${label} deleted`,
        description: `"${term.name}" was deleted.`,
      });
      router.refresh();
    });
  }

  return (
    <div className="space-y-6">
      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'} aria-live="polite">
          {message.type === 'success' && <CheckCircle2 className="size-4" aria-hidden />}
          <AlertTitle>{message.title}</AlertTitle>
          <AlertDescription>{message.description}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Add {emptyLabel}</CardTitle>
          <CardDescription>
            Slugs are optional and will be generated from the name when left empty.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form
            onSubmit={(event) => submitSave(null, event)}
            className="grid gap-4 lg:grid-cols-12"
          >
            <input type="hidden" name="kind" value={kind} />
            <div className="space-y-1.5 lg:col-span-3">
              <label className="text-sm font-medium" htmlFor={`${kind}-new-name`}>
                Name
              </label>
              <Input id={`${kind}-new-name`} name="name" required maxLength={80} />
            </div>
            <div className="space-y-1.5 lg:col-span-3">
              <label className="text-sm font-medium" htmlFor={`${kind}-new-slug`}>
                Slug
              </label>
              <Input
                id={`${kind}-new-slug`}
                name="slug"
                maxLength={120}
                placeholder="generated-from-name"
              />
            </div>
            <div className="space-y-1.5 lg:col-span-2">
              <label className="text-sm font-medium" htmlFor={`${kind}-new-sort-order`}>
                Sort order
              </label>
              <Input
                id={`${kind}-new-sort-order`}
                name="sortOrder"
                type="number"
                min={0}
                max={10000}
                defaultValue={0}
              />
            </div>
            <div className="space-y-1.5 lg:col-span-4">
              <label className="text-sm font-medium" htmlFor={`${kind}-new-description`}>
                Description
              </label>
              <Textarea
                id={`${kind}-new-description`}
                name="description"
                maxLength={240}
                className="min-h-8"
              />
            </div>
            <div className="lg:col-span-12">
              <Button type="submit" disabled={pending}>
                <Plus />
                Add {emptyLabel}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{label}s</CardTitle>
          <CardDescription>{terms.length} total terms</CardDescription>
        </CardHeader>
        <CardContent>
          {terms.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center text-sm">No {emptyLabel}s yet.</p>
          ) : (
            <div className="border-border/60 divide-border/60 overflow-hidden rounded-lg border">
              {terms.map((term) => (
                <div key={term.id} className="divide-border/60 border-b last:border-b-0">
                  <form
                    onSubmit={(event) => submitSave(term.id, event)}
                    className="grid gap-3 p-3 lg:grid-cols-12 lg:items-start"
                  >
                    <input type="hidden" name="kind" value={kind} />
                    <div className="space-y-1 lg:col-span-3">
                      <label className="text-muted-foreground text-xs" htmlFor={`${term.id}-name`}>
                        Name
                      </label>
                      <Input id={`${term.id}-name`} name="name" defaultValue={term.name} required />
                    </div>
                    <div className="space-y-1 lg:col-span-3">
                      <label className="text-muted-foreground text-xs" htmlFor={`${term.id}-slug`}>
                        Slug
                      </label>
                      <Input id={`${term.id}-slug`} name="slug" defaultValue={term.slug} />
                    </div>
                    <div className="space-y-1 lg:col-span-2">
                      <label
                        className="text-muted-foreground text-xs"
                        htmlFor={`${term.id}-sort-order`}
                      >
                        Sort order
                      </label>
                      <Input
                        id={`${term.id}-sort-order`}
                        name="sortOrder"
                        type="number"
                        min={0}
                        max={10000}
                        defaultValue={term.sortOrder}
                      />
                    </div>
                    <div className="space-y-1 lg:col-span-3">
                      <label
                        className="text-muted-foreground text-xs"
                        htmlFor={`${term.id}-description`}
                      >
                        Description
                      </label>
                      <Textarea
                        id={`${term.id}-description`}
                        name="description"
                        defaultValue={term.description ?? ''}
                        maxLength={240}
                        className="min-h-8"
                      />
                    </div>
                    <div className="flex gap-1.5 lg:col-span-1 lg:justify-end lg:pt-5">
                      <Button
                        type="submit"
                        size="icon-sm"
                        variant="outline"
                        disabled={pending}
                        aria-label={`Save ${term.name}`}
                      >
                        <Pencil />
                      </Button>
                    </div>
                  </form>
                  <div className="flex justify-end px-3 pb-3">
                    <form onSubmit={(event) => submitDelete(term, event)}>
                      <Button
                        type="submit"
                        size="sm"
                        variant="destructive"
                        disabled={pending}
                        aria-label={`Delete ${term.name}`}
                      >
                        <Trash2 />
                        Delete
                      </Button>
                    </form>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
