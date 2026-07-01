'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { Save } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { BlogEditorContent } from '@/components/blog/BlogEditorContent';
import { BlogGalleryManager } from '@/components/blog/BlogGalleryManager';
import { BlogMediaPanel } from '@/components/blog/BlogMediaPanel';
import { saveBlogPostAction } from '@/app/admin/blog/actions';
import type { BlogPost, BlogTerm } from '@/lib/data/blog';
import type { BlogPostStatus, BlogTermKind } from '@/lib/validation/blog';

const statusOptions: BlogPostStatus[] = ['draft', 'scheduled', 'published', 'archived'];
const termKinds: BlogTermKind[] = ['category', 'tag', 'attribute'];

function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 16);
}

function termsByKind(terms: BlogTerm[], kind: BlogTermKind): BlogTerm[] {
  return terms.filter((term) => term.kind === kind);
}

function defaultPublishedAt(post: BlogPost | null): string {
  if (post?.publishedAt) return toDateTimeLocal(post.publishedAt);
  if (post?.status === 'published') return toDateTimeLocal(new Date().toISOString());
  return '';
}

export function BlogEditor({ post, terms }: { post: BlogPost | null; terms: BlogTerm[] }) {
  const router = useRouter();
  const [status, setStatus] = useState<BlogPostStatus>(post?.status ?? 'draft');
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const groupedTerms = useMemo(
    () =>
      Object.fromEntries(termKinds.map((kind) => [kind, termsByKind(terms, kind)])) as Record<
        BlogTermKind,
        BlogTerm[]
      >,
    [terms],
  );

  function submit(formData: FormData) {
    setMessage(null);
    startTransition(async () => {
      const result = await saveBlogPostAction(post?.id ?? null, formData);
      if (!result.ok) {
        setMessage(result.error);
        return;
      }
      router.push(`/admin/blog/${result.data.id}`);
      router.refresh();
    });
  }

  return (
    <form action={submit} className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Post</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Title" htmlFor="title">
              <Input id="title" name="title" required defaultValue={post?.title ?? ''} />
            </Field>
            <Field label="Slug" htmlFor="slug">
              <Input
                id="slug"
                name="slug"
                placeholder="auto-generated-from-title"
                defaultValue={post?.slug ?? ''}
              />
            </Field>
            <Field label="Excerpt" htmlFor="excerpt">
              <Textarea
                id="excerpt"
                name="excerpt"
                rows={3}
                maxLength={320}
                defaultValue={post?.excerpt ?? ''}
              />
            </Field>
            <Field label="Content">
              <BlogEditorContent initialContent={post?.contentJson ?? null} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Gallery</CardTitle>
          </CardHeader>
          <CardContent>
            <BlogGalleryManager />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>Publish</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Status" htmlFor="status">
              <select
                id="status"
                name="status"
                value={status}
                onChange={(event) => setStatus(event.currentTarget.value as BlogPostStatus)}
                className="border-input bg-background h-8 w-full rounded-lg border px-2.5 text-sm"
              >
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Published at" htmlFor="publishedAt">
              <Input
                id="publishedAt"
                name="publishedAt"
                type="datetime-local"
                defaultValue={defaultPublishedAt(post)}
                required={status === 'published'}
              />
            </Field>
            <Field label="Scheduled for" htmlFor="scheduledFor">
              <Input
                id="scheduledFor"
                name="scheduledFor"
                type="datetime-local"
                defaultValue={toDateTimeLocal(post?.scheduledFor)}
                required={status === 'scheduled'}
              />
            </Field>
            {message ? <p className="text-destructive text-sm">{message}</p> : null}
            <Button type="submit" className="w-full" disabled={isPending}>
              <Save />
              {isPending ? 'Saving...' : 'Save post'}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Featured image</CardTitle>
          </CardHeader>
          <CardContent>
            <BlogMediaPanel initialMediaId={post?.featuredMediaId ?? null} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Taxonomy</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {termKinds.map((kind) => (
              <div key={kind} className="space-y-2">
                <div className="text-sm font-medium capitalize">{kind}</div>
                {groupedTerms[kind].length === 0 ? (
                  <p className="text-muted-foreground text-xs">No {kind} terms yet.</p>
                ) : (
                  <div className="space-y-2">
                    {groupedTerms[kind].map((term) => (
                      <label key={term.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="termIds"
                          value={term.id}
                          className="border-input size-4 rounded"
                        />
                        <span>{term.name}</span>
                      </label>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>SEO</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label="Meta title" htmlFor="metaTitle">
              <Input
                id="metaTitle"
                name="metaTitle"
                maxLength={70}
                defaultValue={post?.metaTitle ?? ''}
              />
            </Field>
            <Field label="Meta description" htmlFor="metaDescription">
              <Textarea
                id="metaDescription"
                name="metaDescription"
                rows={3}
                maxLength={170}
                defaultValue={post?.metaDescription ?? ''}
              />
            </Field>
            <Field label="Canonical URL" htmlFor="canonicalUrl">
              <Input
                id="canonicalUrl"
                name="canonicalUrl"
                type="url"
                defaultValue={post?.canonicalUrl ?? ''}
              />
            </Field>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="noindex"
                defaultChecked={post?.noindex ?? false}
                className="border-input size-4 rounded"
              />
              <span>Noindex this post</span>
            </label>
          </CardContent>
        </Card>
      </div>
    </form>
  );
}

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={htmlFor}>{label}</Label>
      {children}
    </div>
  );
}
