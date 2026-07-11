'use client';

import { Save } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
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
const localDate = (value: string | null | undefined) => { if (!value) return ''; const date = new Date(value); return Number.isNaN(date.getTime()) ? '' : new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16); };

export function PageEditor({ page }: { page: CmsPage | null }) {
  const router = useRouter();
  const [status, setStatus] = useState<PageStatus>(page?.status ?? 'draft');
  const [hero, setHero] = useState(() => createHeroState(page?.heroSettings, page?.backgroundImageMediaId, page?.heroSettings.backgroundImageUrl ?? null));
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function submit(data: FormData) { setError(null); startTransition(async () => { const result = await saveCmsPageAction(page?.id ?? null, data); if (!result.ok) { setError(result.error); return; } router.push(`/admin/pages/${result.data.id}`); router.refresh(); }); }
  return <form action={submit} className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
    <div className="space-y-6"><Card><CardHeader><CardTitle>Page content</CardTitle></CardHeader><CardContent className="space-y-4"><F label="Title" id="title"><Input id="title" name="title" required maxLength={180} defaultValue={page?.title ?? ''} /></F><F label="Slug" id="slug"><Input id="slug" name="slug" placeholder="generated-from-title" defaultValue={page?.slug ?? ''} /></F><F label="Content" id="content-editor"><BlogEditorContent initialContent={page?.contentJson ?? null} /></F></CardContent></Card>
      <Card><CardHeader><CardTitle>Hero Section</CardTitle></CardHeader><CardContent><PageHeroSettings state={hero} onChange={setHero} /></CardContent></Card>
      <Card><CardHeader><CardTitle>SEO &amp; Schema</CardTitle></CardHeader><CardContent className="space-y-4"><F label="Meta title" id="metaTitle"><Input id="metaTitle" name="metaTitle" maxLength={70} defaultValue={page?.metaTitle ?? ''} /></F><F label="Canonical URL" id="canonicalUrl"><Input id="canonicalUrl" name="canonicalUrl" type="url" defaultValue={page?.canonicalUrl ?? ''} /></F><F label="Schema markup (JSON object)" id="schemaMarkup"><Textarea id="schemaMarkup" name="schemaMarkup" rows={6} className="font-mono text-xs" defaultValue={page?.schemaMarkup ? JSON.stringify(page.schemaMarkup, null, 2) : ''} /></F><label className="flex items-center gap-2 text-sm"><input type="checkbox" name="noindex" defaultChecked={page?.noindex ?? false} className="size-4 rounded border-input" />Noindex this page</label><details className="rounded-lg border p-4"><summary className="cursor-pointer text-sm font-medium">Advanced scripts</summary><div className="mt-4 space-y-4"><F label="Head script" id="scriptHead"><Textarea id="scriptHead" name="scriptHead" rows={3} defaultValue={page?.scriptHead ?? ''} /></F><F label="Body start script" id="scriptBodyStart"><Textarea id="scriptBodyStart" name="scriptBodyStart" rows={3} defaultValue={page?.scriptBodyStart ?? ''} /></F><F label="Body end script" id="scriptBodyEnd"><Textarea id="scriptBodyEnd" name="scriptBodyEnd" rows={3} defaultValue={page?.scriptBodyEnd ?? ''} /></F></div></details></CardContent></Card>
    </div>
    <aside className="space-y-6 xl:sticky xl:top-6"><Card><CardHeader><CardTitle>Publishing</CardTitle></CardHeader><CardContent className="space-y-4"><F label="Status" id="status"><select id="status" name="status" value={status} onChange={e => setStatus(e.currentTarget.value as PageStatus)} className="border-input bg-background h-9 w-full rounded-lg border px-3 text-sm">{statuses.map(value => <option key={value}>{value}</option>)}</select></F><F label="Published at" id="publishedAt"><Input id="publishedAt" name="publishedAt" type="datetime-local" required={status === 'published'} defaultValue={localDate(page?.publishedAt)} /></F><F label="Scheduled for" id="scheduledFor"><Input id="scheduledFor" name="scheduledFor" type="datetime-local" required={status === 'scheduled'} defaultValue={localDate(page?.scheduledFor)} /></F>{error ? <p role="alert" className="text-sm text-destructive">{error}</p> : null}<Button type="submit" disabled={pending} className="w-full"><Save />{pending ? 'Saving…' : 'Save page'}</Button></CardContent></Card>
      <Card><CardHeader><CardTitle>Excerpt</CardTitle></CardHeader><CardContent><F label="Search and share description" id="metaDescription"><Textarea id="metaDescription" name="metaDescription" rows={5} maxLength={170} defaultValue={page?.metaDescription ?? ''} /></F></CardContent></Card></aside>
  </form>;
}
function F({ label, id, children }: { label: string; id: string; children: React.ReactNode }) { return <div className="space-y-2"><Label htmlFor={id}>{label}</Label>{children}</div>; }
