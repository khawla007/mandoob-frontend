'use client';

import { Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { useTranslations } from 'next-intl';
import { saveCmsPageAction } from '@/app/admin/pages/actions';
import { BlogEditorContent } from '@/components/blog/BlogEditorContent';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { CmsPage } from '@/lib/data/pages';
import type { PageStatus } from '@/lib/validation/pages';
import { PageHeroSettings } from './PageHeroSettings';
import { createHeroState } from './admin-page-state';

const statuses: PageStatus[] = ['draft', 'scheduled', 'published', 'archived'];
const localDate = (value: string | null | undefined) => {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? ''
    : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
};

export function PageEditor({ page }: { page: CmsPage | null }) {
  const t = useTranslations('admin.cms.pages.editor');
  const router = useRouter();
  const [status, setStatus] = useState<PageStatus>(page?.status ?? 'draft');
  const [hero, setHero] = useState(() =>
    createHeroState(
      page?.heroSettings,
      page?.backgroundImageMediaId,
      page?.heroSettings.backgroundImageUrl ?? null,
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function submit(data: FormData) {
    data.set('operationId', crypto.randomUUID());
    if (page) data.set('expectedVersion', String(page.rowVersion ?? 1));
    setError(null);
    startTransition(async () => {
      const result = await saveCmsPageAction(page?.id ?? null, data);
      if (!result.ok) {
        setError(t('saveError'));
        return;
      }
      router.push(`/admin/pages/${result.data.id}`);
      router.refresh();
    });
  }
  return (
    <form action={submit} className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('pageContent')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <F label={t('title')} id="title">
              <Input
                id="title"
                name="title"
                required
                maxLength={180}
                defaultValue={page?.title ?? ''}
              />
            </F>
            <F label={t('slug')} id="slug">
              <Input
                id="slug"
                name="slug"
                placeholder="generated-from-title"
                defaultValue={page?.slug ?? ''}
              />
            </F>
            <F label={t('content')} id="content-editor">
              <BlogEditorContent initialContent={page?.contentJson ?? null} />
            </F>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('heroSection')}</CardTitle>
          </CardHeader>
          <CardContent>
            <PageHeroSettings state={hero} onChange={setHero} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('seoSchema')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <F label={t('metaTitle')} id="metaTitle">
              <Input
                id="metaTitle"
                name="metaTitle"
                maxLength={70}
                defaultValue={page?.metaTitle ?? ''}
              />
            </F>
            <F label={t('canonicalUrl')} id="canonicalUrl">
              <Input
                id="canonicalUrl"
                name="canonicalUrl"
                type="url"
                defaultValue={page?.canonicalUrl ?? ''}
              />
            </F>
            <F label={t('schemaMarkup')} id="schemaMarkup">
              <Textarea
                id="schemaMarkup"
                name="schemaMarkup"
                rows={6}
                className="font-mono text-xs"
                defaultValue={page?.schemaMarkup ? JSON.stringify(page.schemaMarkup, null, 2) : ''}
              />
            </F>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                name="noindex"
                defaultChecked={page?.noindex ?? false}
                className="border-input size-4 rounded"
              />
              {t('noindex')}
            </label>
            <details className="rounded-lg border p-4">
              <summary className="cursor-pointer text-sm font-medium">
                {t('advancedScripts')}
              </summary>
              <div className="mt-4 space-y-4">
                <F label={t('headScript')} id="scriptHead">
                  <Textarea
                    id="scriptHead"
                    name="scriptHead"
                    rows={3}
                    defaultValue={page?.scriptHead ?? ''}
                  />
                </F>
                <F label={t('bodyStartScript')} id="scriptBodyStart">
                  <Textarea
                    id="scriptBodyStart"
                    name="scriptBodyStart"
                    rows={3}
                    defaultValue={page?.scriptBodyStart ?? ''}
                  />
                </F>
                <F label={t('bodyEndScript')} id="scriptBodyEnd">
                  <Textarea
                    id="scriptBodyEnd"
                    name="scriptBodyEnd"
                    rows={3}
                    defaultValue={page?.scriptBodyEnd ?? ''}
                  />
                </F>
              </div>
            </details>
          </CardContent>
        </Card>
      </div>
      <aside className="space-y-6 xl:sticky xl:top-6">
        <Card>
          <CardHeader>
            <CardTitle>{t('publishing')}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <F label={t('status')} id="status">
              <select
                id="status"
                name="status"
                value={status}
                onChange={(e) => setStatus(e.currentTarget.value as PageStatus)}
                className="border-input bg-background h-9 w-full rounded-lg border px-3 text-sm"
              >
                {statuses.map((value) => (
                  <option key={value} value={value}>
                    {t(`statuses.${value}`)}
                  </option>
                ))}
              </select>
            </F>
            <F label={t('publishedAt')} id="publishedAt">
              <Input
                id="publishedAt"
                name="publishedAt"
                type="datetime-local"
                required={status === 'published'}
                defaultValue={localDate(page?.publishedAt)}
              />
            </F>
            <F label={t('scheduledFor')} id="scheduledFor">
              <Input
                id="scheduledFor"
                name="scheduledFor"
                type="datetime-local"
                required={status === 'scheduled'}
                defaultValue={localDate(page?.scheduledFor)}
              />
            </F>
            {error ? (
              <p role="alert" className="text-destructive text-sm">
                {error}
              </p>
            ) : null}
            <Button type="submit" disabled={pending} className="w-full">
              <Save />
              {pending ? t('saving') : t('save')}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>{t('excerpt')}</CardTitle>
          </CardHeader>
          <CardContent>
            <F label={t('metaDescription')} id="metaDescription">
              <Textarea
                id="metaDescription"
                name="metaDescription"
                rows={5}
                maxLength={170}
                defaultValue={page?.metaDescription ?? ''}
              />
            </F>
          </CardContent>
        </Card>
      </aside>
    </form>
  );
}
function F({ label, id, children }: { label: string; id: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      {children}
    </div>
  );
}
