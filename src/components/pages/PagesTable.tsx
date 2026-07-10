'use client';

import Link from 'next/link';
import { Pencil, Trash2 } from 'lucide-react';
import { useEffect, useRef, useState, useTransition } from 'react';
import { deleteCmsPageAction } from '@/app/admin/pages/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { formatAdminDateTime } from '@/lib/format/date';
import type { CmsPageListItem } from '@/lib/data/pages';
import { dialogTabDestination } from './admin-page-state';
export { clampAdminPage, pageHref } from './admin-page-state';

export function PagesTable({ pages }: { pages: CmsPageListItem[] }) {
  const [target, setTarget] = useState<CmsPageListItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const invokerRef = useRef<HTMLButtonElement>(null);
  const pendingRef = useRef(pending);
  pendingRef.current = pending;
  useEffect(() => {
    if (!target) return;
    cancelRef.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pendingRef.current) { event.preventDefault(); setTarget(null); return; }
      if (event.key === 'Tab') {
        const controls = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? []);
        event.preventDefault();
        const current = controls.indexOf(document.activeElement as HTMLElement);
        const destination = dialogTabDestination(current < 0 ? (event.shiftKey ? 0 : -1) : current, controls.length, event.shiftKey);
        if (destination === 'dialog') dialogRef.current?.focus();
        else controls[destination]?.focus();
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => { window.removeEventListener('keydown', keyboard); invokerRef.current?.focus(); };
  }, [target]);
  function remove() { if (!target) return; setError(null); startTransition(async () => { const result = await deleteCmsPageAction(target.id); if (!result.ok) { setError(result.error); return; } setTarget(null); window.location.reload(); }); }
  return <>
    <Table><TableHeader><TableRow><TableHead>Title</TableHead><TableHead>Slug</TableHead><TableHead>Status</TableHead><TableHead>Published</TableHead><TableHead>Updated</TableHead><TableHead className="text-right">Actions</TableHead></TableRow></TableHeader>
      <TableBody>{pages.map(page => <TableRow key={page.id}><TableCell className="font-medium">{page.title}</TableCell><TableCell className="font-mono text-xs text-muted-foreground">{page.slug}</TableCell><TableCell><Badge variant={page.status === 'published' ? 'default' : page.status === 'scheduled' ? 'secondary' : 'outline'} className="capitalize">{page.status}</Badge></TableCell><TableCell className="text-xs tabular-nums text-muted-foreground">{page.publishedAt ? formatAdminDateTime(page.publishedAt) : '—'}</TableCell><TableCell className="text-xs tabular-nums text-muted-foreground">{formatAdminDateTime(page.updatedAt)}</TableCell><TableCell><div className="flex justify-end gap-1"><Button asChild variant="ghost" size="icon-sm"><Link href={`/admin/pages/${page.id}`} aria-label={`Edit ${page.title}`}><Pencil /></Link></Button><Button type="button" variant="ghost" size="icon-sm" aria-label={`Delete ${page.title}`} onClick={event => { invokerRef.current = event.currentTarget; setError(null); setTarget(page); }}><Trash2 /></Button></div></TableCell></TableRow>)}</TableBody></Table>
    {target ? <div className="fixed inset-0 z-50 grid place-items-center bg-black/45 p-4" role="presentation" onMouseDown={e => { if (e.target === e.currentTarget && !pending) setTarget(null); }}><section ref={dialogRef} tabIndex={-1} role="alertdialog" aria-modal="true" aria-labelledby="delete-page-title" aria-describedby="delete-page-description" className="bg-background w-full max-w-md rounded-xl border p-6 shadow-2xl outline-none"><h2 id="delete-page-title" className="text-lg font-semibold">Delete page?</h2><p id="delete-page-description" className="mt-2 text-sm text-muted-foreground">“{target.title}” will be removed from the page library. This action cannot be undone here.</p>{error ? <p role="alert" className="mt-3 text-sm text-destructive">{error}</p> : null}<div className="mt-6 flex justify-end gap-2"><Button ref={cancelRef} type="button" variant="outline" disabled={pending} onClick={() => setTarget(null)}>Cancel</Button><Button type="button" variant="destructive" disabled={pending} onClick={remove}>{pending ? 'Deleting…' : 'Delete page'}</Button></div></section></div> : null}
  </>;
}
