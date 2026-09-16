'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
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
  const offsetMs = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
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
  const t = useTranslations('admin.cms.blog.editor');
  const router = useRouter();
  const [status, setStatus] = useState<BlogPostStatus>(post?.status ?? 'draft');
  const [message, setMessage] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const selectedTermIds = useMemo(() => new Set(post?.termIds ?? []), [post?.termIds]);
  const groupedTerms = useMemo(
    () =>
      Object.fromEntries(termKinds.map((kind) => [kind, termsByKind(terms, kind)])) as Record<
        BlogTermKind,
        BlogTerm[]
      >,
    [terms],
  );

  function submit(formData: FormData) {
    formData.set('operationId', crypto.randomUUID());
    if (post) formData.set('expectedVersion', String(post.rowVersion ?? 1));
    setMessage(null);
    startTransition(async () => {
      const result = await saveBlogPostAction(post?.id ?? null, formData);
      if (!result.ok) {
        setMessage(t('saveError'));
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
            <CardTitle>{t('post')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label={t('title')} htmlFor="title">
              <Input id="title" name="title" required defaultValue={post?.title ?? ''} />
            </Field>
            <Field label={t('slug')} htmlFor="slug">
              <Input
                id="slug"
                name="slug"
                placeholder="auto-generated-from-title"
                defaultValue={post?.slug ?? ''}
              />
            </Field>
            <Field label={t('excerpt')} htmlFor="excerpt">
              <Textarea
                id="excerpt"
                name="excerpt"
                rows={3}
                maxLength={320}
                defaultValue={post?.excerpt ?? ''}
              />
            </Field>
            <Field label={t('content')}>
              <BlogEditorContent initialContent={post?.contentJson ?? null} />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('gallery')}</CardTitle>
          </CardHeader>
          <CardContent>
            <BlogGalleryManager initialMediaIds={post?.galleryMediaIds ?? []} />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('publish')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label={t('status')} htmlFor="status">
              <select
                id="status"
                name="status"
                value={status}
                onChange={(event) => setStatus(event.currentTarget.value as BlogPostStatus)}
                className="border-input bg-background h-8 w-full rounded-lg border px-2.5 text-sm"
              >
                {statusOptions.map((option) => (
                  <option key={option} value={option}>
                    {t(`statuses.${option}`)}
                  </option>
                ))}
              </select>
            </Field>
            <Field label={t('publishedAt')} htmlFor="publishedAt">
              <Input
                id="publishedAt"
                name="publishedAt"
                type="datetime-local"
                defaultValue={defaultPublishedAt(post)}
                required={status === 'published'}
              />
            </Field>
            <Field label={t('scheduledFor')} htmlFor="scheduledFor">
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
              {isPending ? t('saving') : t('save')}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('featuredImage')}</CardTitle>
          </CardHeader>
          <CardContent>
            <BlogMediaPanel initialMediaId={post?.featuredMediaId ?? null} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>{t('taxonomy')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {termKinds.map((kind) => (
              <div key={kind} className="space-y-2">
                <div className="text-sm font-medium">{t(`termKinds.${kind}`)}</div>
                {groupedTerms[kind].length === 0 ? (
                  <p className="text-muted-foreground text-xs">
                    {t('noTerms', { kind: t(`termKinds.${kind}`) })}
                  </p>
                ) : (
                  <div className="space-y-2">
                    {groupedTerms[kind].map((term) => (
                      <label key={term.id} className="flex items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          name="termIds"
                          value={term.id}
                          defaultChecked={selectedTermIds.has(term.id)}
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
            <CardTitle>{t('seo')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field label={t('metaTitle')} htmlFor="metaTitle">
              <Input
                id="metaTitle"
                name="metaTitle"
                maxLength={70}
                defaultValue={post?.metaTitle ?? ''}
              />
            </Field>
            <Field label={t('metaDescription')} htmlFor="metaDescription">
              <Textarea
                id="metaDescription"
                name="metaDescription"
                rows={3}
                maxLength={170}
                defaultValue={post?.metaDescription ?? ''}
              />
            </Field>
            <Field label={t('canonicalUrl')} htmlFor="canonicalUrl">
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
              <span>{t('noindex')}</span>
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
