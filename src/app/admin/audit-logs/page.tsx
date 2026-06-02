import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AuditLogTable } from '@/components/admin/AuditLogTable';
import { requireRole } from '@/lib/auth/require-role';
import { listAuditLog } from '@/lib/data/audit-log';
import { listProFirms } from '@/lib/data/pro-firms';
import {
  AUDIT_KIND,
  TENANT_AUDIT_ACTIONS,
  AUTH_EVENT_KINDS,
  auditLogFiltersSchema,
  type AuditKind,
} from '@/lib/validation/observability';

export const dynamic = 'force-dynamic';

type SearchParams = {
  kind?: string;
  tenant?: string;
  actor?: string;
  actions?: string | string[];
  from?: string;
  to?: string;
  q?: string;
  cursor?: string;
};

function toArray(v: string | string[] | undefined): string[] {
  if (!v) return [];
  return Array.isArray(v) ? v : [v];
}

function parseFilters(sp: SearchParams) {
  const parsed = auditLogFiltersSchema.safeParse({
    kind: sp.kind,
    tenant: sp.tenant || undefined,
    actor: sp.actor || undefined,
    actions: toArray(sp.actions),
    from: sp.from || undefined,
    to: sp.to || undefined,
    q: sp.q || undefined,
    cursor: sp.cursor || undefined,
  });
  if (parsed.success) return parsed.data;
  return auditLogFiltersSchema.parse({});
}

function buildHref(base: SearchParams, override: Partial<SearchParams>): string {
  const merged: Record<string, string | string[]> = {};
  for (const [k, v] of Object.entries({ ...base, ...override })) {
    if (v == null || v === '') continue;
    merged[k] = v as string | string[];
  }
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(merged)) {
    if (Array.isArray(v)) for (const x of v) sp.append(k, x);
    else sp.set(k, v);
  }
  const qs = sp.toString();
  return qs ? `/admin/audit-logs?${qs}` : '/admin/audit-logs';
}

export default async function AuditLogsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole('super_admin');
  const t = await getTranslations('admin');
  const sp = await searchParams;
  const filters = parseFilters(sp);

  const [page, tenants] = await Promise.all([listAuditLog(filters), listProFirms({})]);

  const actionsForKind: ReadonlyArray<string> =
    filters.kind === 'tenant_audit' ? TENANT_AUDIT_ACTIONS : AUTH_EVENT_KINDS;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('audit.page.title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('audit.page.intro')}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('audit.page.filters')}</CardTitle>
          <CardDescription>{t('audit.page.filtersDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-2 pb-4">
            {AUDIT_KIND.map((k) => (
              <KindLink
                key={k}
                sp={sp}
                value={k}
                active={filters.kind === k}
                label={t(`audit.kind.${k}`)}
              />
            ))}
          </div>
          <form className="grid grid-cols-1 gap-3 md:grid-cols-6" action="/admin/audit-logs">
            <input type="hidden" name="kind" value={filters.kind} />
            <div className="md:col-span-2">
              <Label htmlFor="tenant">{t('audit.page.tenant')}</Label>
              <select
                id="tenant"
                name="tenant"
                defaultValue={filters.tenant ?? ''}
                className="border-input bg-background mt-1 h-9 w-full rounded-md border px-2 text-sm"
              >
                <option value="">{t('audit.page.allTenants')}</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="actor">{t('audit.page.actor')}</Label>
              <Input
                id="actor"
                name="actor"
                placeholder="00000000-…"
                defaultValue={filters.actor ?? ''}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="from">{t('audit.page.from')}</Label>
              <Input
                type="date"
                id="from"
                name="from"
                defaultValue={filters.from ?? ''}
                className="mt-1"
              />
            </div>
            <div>
              <Label htmlFor="to">{t('audit.page.to')}</Label>
              <Input
                type="date"
                id="to"
                name="to"
                defaultValue={filters.to ?? ''}
                className="mt-1"
              />
            </div>
            <div className="md:col-span-3">
              <Label htmlFor="actions">{t('audit.page.actions')}</Label>
              <select
                id="actions"
                name="actions"
                multiple
                defaultValue={filters.actions}
                className="border-input bg-background mt-1 h-24 w-full rounded-md border px-2 text-sm"
              >
                {actionsForKind.map((a) => (
                  <option key={a} value={a}>
                    {a}
                  </option>
                ))}
              </select>
            </div>
            <div className="md:col-span-2">
              <Label htmlFor="q">{t('audit.page.searchDetails')}</Label>
              <Input
                id="q"
                name="q"
                placeholder="entity, status, …"
                defaultValue={filters.q ?? ''}
                className="mt-1"
              />
            </div>
            <div className="flex items-end gap-2">
              <Button type="submit">{t('audit.page.apply')}</Button>
              <Button asChild variant="outline">
                <Link href={`/admin/audit-logs?kind=${filters.kind}`}>{t('audit.page.reset')}</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">
            {filters.kind === 'tenant_audit'
              ? t('audit.page.tenantAuditLog')
              : t('audit.page.authEvents')}
          </CardTitle>
          <CardDescription>{t('audit.page.resultsDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <AuditLogTable rows={page.rows} />
          <div className="mt-4 flex justify-end">
            {page.nextCursor ? (
              <Button asChild variant="outline" size="sm">
                <Link href={buildHref(sp, { cursor: page.nextCursor })}>
                  {t('audit.page.nextPage')}
                </Link>
              </Button>
            ) : (
              <span className="text-muted-foreground text-xs">{t('audit.page.endOfResults')}</span>
            )}
          </div>
          {sp.cursor && (
            <div className="mt-2 flex justify-end">
              <Button asChild variant="ghost" size="sm">
                <Link href={buildHref(sp, { cursor: '' })}>{t('audit.page.firstPage')}</Link>
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function KindLink({
  sp,
  value,
  active,
  label,
}: {
  sp: SearchParams;
  value: AuditKind;
  active: boolean;
  label: string;
}) {
  const href = buildHref(sp, { kind: value, cursor: '' });
  return (
    <Link
      href={href}
      className={
        active
          ? 'bg-foreground text-background rounded px-3 py-1 text-sm'
          : 'border-border hover:bg-muted rounded border px-3 py-1 text-sm'
      }
    >
      {label}
    </Link>
  );
}
