'use client';

import Link from 'next/link';
import { Pencil, Trash2 } from 'lucide-react';
import { useEffect, useId, useRef, useState, useTransition } from 'react';
import { useLocale, useTranslations } from 'next-intl';
import { deleteCmsPageAction } from '@/app/admin/pages/actions';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableCaption,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { formatDateTime } from '@/lib/i18n/format';
import type { CmsPageListItem } from '@/lib/data/pages';
import { dialogTabDestination } from './admin-page-state';
export { clampAdminPage, pageHref } from './admin-page-state';

export function PagesTable({ pages }: { pages: CmsPageListItem[] }) {
  const t = useTranslations('admin.cms.pages.table');
  const locale = useLocale();
  const dialogTitleId = useId();
  const dialogDescriptionId = useId();
  const [target, setTarget] = useState<CmsPageListItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const cancelRef = useRef<HTMLButtonElement>(null);
  const dialogRef = useRef<HTMLElement>(null);
  const invokerRef = useRef<HTMLButtonElement>(null);
  const pendingRef = useRef(pending);
  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);
  useEffect(() => {
    if (!target) return;
    cancelRef.current?.focus();
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !pendingRef.current) {
        event.preventDefault();
        setTarget(null);
        return;
      }
      if (event.key === 'Tab') {
        const controls = Array.from(
          dialogRef.current?.querySelectorAll<HTMLElement>('button:not(:disabled)') ?? [],
        );
        event.preventDefault();
        const current = controls.indexOf(document.activeElement as HTMLElement);
        const destination = dialogTabDestination(
          current < 0 ? (event.shiftKey ? 0 : -1) : current,
          controls.length,
          event.shiftKey,
        );
        if (destination === 'dialog') dialogRef.current?.focus();
        else controls[destination]?.focus();
      }
    };
    window.addEventListener('keydown', keyboard);
    return () => {
      window.removeEventListener('keydown', keyboard);
      invokerRef.current?.focus();
    };
  }, [target]);
  function remove() {
    if (!target) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteCmsPageAction(
        target.id,
        crypto.randomUUID(),
        target.rowVersion ?? 1,
      );
      if (!result.ok) {
        setError(t('deleteError'));
        return;
      }
      setTarget(null);
      window.location.reload();
    });
  }
  return (
    <>
      <Table>
        <TableCaption className="sr-only">{t('caption')}</TableCaption>
        <TableHeader>
          <TableRow>
            <TableHead>{t('title')}</TableHead>
            <TableHead>{t('slug')}</TableHead>
            <TableHead>{t('status')}</TableHead>
            <TableHead>{t('published')}</TableHead>
            <TableHead>{t('updated')}</TableHead>
            <TableHead className="text-right">{t('actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {pages.map((page) => (
            <TableRow key={page.id}>
              <TableCell className="font-medium">{page.title}</TableCell>
              <TableCell className="text-muted-foreground font-mono text-xs">{page.slug}</TableCell>
              <TableCell>
                <Badge
                  variant={
                    page.status === 'published'
                      ? 'default'
                      : page.status === 'scheduled'
                        ? 'secondary'
                        : 'outline'
                  }
                  className="capitalize"
                >
                  {t(`statuses.${page.status}`)}
                </Badge>
              </TableCell>
              <TableCell className="text-muted-foreground text-xs tabular-nums">
                {page.publishedAt ? formatDateTime(page.publishedAt, locale) : '—'}
              </TableCell>
              <TableCell className="text-muted-foreground text-xs tabular-nums">
                {formatDateTime(page.updatedAt, locale)}
              </TableCell>
              <TableCell>
                <div className="flex justify-end gap-1">
                  <Button asChild variant="ghost" size="icon-sm">
                    <Link
                      href={`/admin/pages/${page.id}`}
                      aria-label={t('edit', { title: page.title })}
                    >
                      <Pencil />
                    </Link>
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-sm"
                    aria-label={t('delete', { title: page.title })}
                    onClick={(event) => {
                      invokerRef.current = event.currentTarget;
                      setError(null);
                      setTarget(page);
                    }}
                  >
                    <Trash2 />
                  </Button>
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
      {target ? (
        <div
          className="bg-foreground/40 fixed inset-0 z-50 grid place-items-center p-4"
          role="presentation"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !pending) setTarget(null);
          }}
        >
          <section
            ref={dialogRef}
            tabIndex={-1}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby={dialogTitleId}
            aria-describedby={dialogDescriptionId}
            className="bg-background w-full max-w-md rounded-xl border p-6 shadow-2xl outline-none"
          >
            <h2 id={dialogTitleId} className="text-lg font-semibold">
              {t('deleteTitle')}
            </h2>
            <p id={dialogDescriptionId} className="text-muted-foreground mt-2 text-sm">
              {t('deleteDescription', { title: target.title })}
            </p>
            {error ? (
              <p role="alert" className="text-destructive mt-3 text-sm">
                {error}
              </p>
            ) : null}
            <div className="mt-6 flex justify-end gap-2">
              <Button
                ref={cancelRef}
                type="button"
                variant="outline"
                disabled={pending}
                onClick={() => setTarget(null)}
              >
                {t('cancel')}
              </Button>
              <Button type="button" variant="destructive" disabled={pending} onClick={remove}>
                {pending ? t('deleting') : t('deleteAction')}
              </Button>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
