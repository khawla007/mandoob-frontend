import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { requireRole } from '@/lib/auth/require-role';
import {
  listWhatsAppTemplateApprovals,
  WHATSAPP_TEMPLATE_APPROVAL_STATUSES,
  WHATSAPP_TEMPLATE_CATEGORIES,
  type WhatsAppTemplateApprovalFilters,
  type WhatsAppTemplateApprovalViewRow,
  type WhatsAppTemplateApprovalViewStatus,
} from '@/lib/data/whatsapp-template-approvals';
import { updateWhatsAppTemplateApprovalAction } from './actions';

export const dynamic = 'force-dynamic';

type SearchParams = {
  status?: string;
  category?: string;
  tenantId?: string;
};

export default async function AdminWhatsAppTemplatesPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  await requireRole('super_admin', 'admin');
  const t = await getTranslations('admin');
  const sp = await searchParams;
  const filters: WhatsAppTemplateApprovalFilters = {
    status: parseStatus(sp.status),
    category: parseCategory(sp.category),
    tenantId: sp.tenantId?.trim() || null,
  };
  const rows = await listWhatsAppTemplateApprovals(filters);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('whatsapp.title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('whatsapp.intro')}</p>
      </div>

      <Card>
        <CardContent className="p-4">
          <form
            className="grid gap-3 md:grid-cols-[1fr_180px_180px_auto]"
            action="/admin/whatsapp-templates"
          >
            <Input
              name="tenantId"
              defaultValue={sp.tenantId ?? ''}
              placeholder={t('whatsapp.tenantPlaceholder')}
            />
            <select
              name="status"
              defaultValue={filters.status ?? 'all'}
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            >
              <option value="all">{t('whatsapp.allStatuses')}</option>
              <option value="missing">{t('whatsapp.statusEnum.missing')}</option>
              {WHATSAPP_TEMPLATE_APPROVAL_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {statusLabel(t, status)}
                </option>
              ))}
            </select>
            <select
              name="category"
              defaultValue={filters.category ?? 'all'}
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            >
              <option value="all">{t('whatsapp.allCategories')}</option>
              {WHATSAPP_TEMPLATE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {categoryLabel(t, category)}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline">
              {t('whatsapp.filter')}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('whatsapp.template')}</TableHead>
                <TableHead>{t('whatsapp.scope')}</TableHead>
                <TableHead>{t('whatsapp.status')}</TableHead>
                <TableHead>{t('whatsapp.timestamps')}</TableHead>
                <TableHead>{t('whatsapp.notes')}</TableHead>
                <TableHead className="min-w-[360px]">{t('whatsapp.update')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={`${row.templateId}:${row.language}:${row.tenantId ?? 'global'}`}>
                  <TableCell className="align-top whitespace-normal">
                    <div className="font-medium">{row.templateId}</div>
                    <div className="text-muted-foreground mt-1 text-xs">
                      {t('whatsapp.metaPrefix', { name: row.metaTemplateName })}
                    </div>
                    <div className="text-muted-foreground mt-1 flex flex-wrap gap-2 text-xs">
                      <span>{row.language}</span>
                      <span>{categoryLabel(t, row.category)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="align-top whitespace-normal">
                    <div className="font-medium">{scopeLabel(t, row, filters.tenantId)}</div>
                    {(row.tenantId ?? filters.tenantId) ? (
                      <div className="text-muted-foreground mt-1 text-xs break-all">
                        {row.tenantId ?? filters.tenantId}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="align-top">
                    <StatusBadge t={t} status={row.status} />
                  </TableCell>
                  <TableCell className="align-top text-xs whitespace-normal">
                    <Timestamp label={t('whatsapp.tsSubmitted')} value={row.submittedAt} />
                    <Timestamp label={t('whatsapp.tsChecked')} value={row.lastCheckedAt} />
                    <Timestamp label={t('whatsapp.tsUpdated')} value={row.updatedAt} />
                  </TableCell>
                  <TableCell className="max-w-[280px] align-top text-sm whitespace-normal">
                    <TextBlock label={t('whatsapp.blockNotes')} value={row.notes} />
                    <TextBlock label={t('whatsapp.blockRejection')} value={row.rejectionReason} />
                  </TableCell>
                  <TableCell className="align-top">
                    <ApprovalForm t={t} row={row} tenantId={filters.tenantId ?? null} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {rows.length === 0 ? (
            <div className="text-muted-foreground px-4 py-8 text-center text-sm">
              {t('whatsapp.empty')}
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

type AdminTranslator = Awaited<ReturnType<typeof getTranslations<'admin'>>>;

function statusLabel(t: AdminTranslator, status: string): string {
  return t.has(`whatsapp.statusEnum.${status}`)
    ? t(`whatsapp.statusEnum.${status}`)
    : label(status);
}

function categoryLabel(t: AdminTranslator, category: string): string {
  return t.has(`whatsapp.category.${category}`)
    ? t(`whatsapp.category.${category}`)
    : label(category);
}

function ApprovalForm({
  t,
  row,
  tenantId,
}: {
  t: AdminTranslator;
  row: WhatsAppTemplateApprovalViewRow;
  tenantId: string | null;
}) {
  const targetTenantId = row.tenantId ?? tenantId ?? '';
  return (
    <form action={updateWhatsAppTemplateApprovalAction as never} className="grid gap-2">
      <input type="hidden" name="templateId" value={row.templateId} />
      <input type="hidden" name="tenantId" value={targetTenantId} />
      <div className="grid gap-2 sm:grid-cols-2">
        <select
          name="status"
          defaultValue={row.status === 'missing' ? 'pending' : row.status}
          className="border-input bg-background h-9 rounded-md border px-3 text-sm"
        >
          {WHATSAPP_TEMPLATE_APPROVAL_STATUSES.map((status) => (
            <option key={status} value={status}>
              {statusLabel(t, status)}
            </option>
          ))}
        </select>
        <Input
          type="text"
          name="submittedAt"
          defaultValue={row.submittedAt ?? ''}
          placeholder={t('whatsapp.submittedPlaceholder')}
          aria-label={t('whatsapp.submittedPlaceholder')}
        />
      </div>
      <Input
        type="text"
        name="lastCheckedAt"
        defaultValue={row.lastCheckedAt ?? ''}
        placeholder={t('whatsapp.lastCheckedPlaceholder')}
        aria-label={t('whatsapp.lastCheckedPlaceholder')}
      />
      <Textarea
        name="notes"
        defaultValue={row.notes ?? ''}
        placeholder={t('whatsapp.notesPlaceholder')}
      />
      <Textarea
        name="rejectionReason"
        defaultValue={row.rejectionReason ?? ''}
        placeholder={t('whatsapp.rejectionPlaceholder')}
      />
      <Button type="submit" size="sm">
        {t('whatsapp.save')}
      </Button>
    </form>
  );
}

function StatusBadge({
  t,
  status,
}: {
  t: AdminTranslator;
  status: WhatsAppTemplateApprovalViewStatus;
}) {
  const variant =
    status === 'approved' ? 'default' : status === 'rejected' ? 'destructive' : 'secondary';
  return <Badge variant={variant}>{statusLabel(t, status)}</Badge>;
}

function Timestamp({ label: name, value }: { label: string; value: string | null }) {
  return (
    <div className="mb-1">
      <span className="text-muted-foreground">{name}: </span>
      {formatDate(value)}
    </div>
  );
}

function TextBlock({ label: name, value }: { label: string; value: string | null }) {
  return (
    <div className="mb-3">
      <div className="text-muted-foreground text-xs">{name}</div>
      <div>{value || '-'}</div>
    </div>
  );
}

function parseStatus(value: string | undefined): WhatsAppTemplateApprovalFilters['status'] {
  if (!value || value === 'all') return 'all';
  if (value === 'missing') return 'missing';
  return (WHATSAPP_TEMPLATE_APPROVAL_STATUSES as readonly string[]).includes(value)
    ? (value as WhatsAppTemplateApprovalFilters['status'])
    : 'all';
}

function parseCategory(value: string | undefined): WhatsAppTemplateApprovalFilters['category'] {
  if (!value || value === 'all') return 'all';
  return (WHATSAPP_TEMPLATE_CATEGORIES as readonly string[]).includes(value)
    ? (value as WhatsAppTemplateApprovalFilters['category'])
    : 'all';
}

function label(value: string): string {
  return value
    .split(/[-_]/)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function scopeLabel(
  t: AdminTranslator,
  row: WhatsAppTemplateApprovalViewRow,
  tenantId: string | null | undefined,
): string {
  if (row.scope !== 'missing') {
    return t.has(`whatsapp.scopeEnum.${row.scope}`)
      ? t(`whatsapp.scopeEnum.${row.scope}`)
      : label(row.scope);
  }
  return tenantId ? t('whatsapp.scopeMissingTenant') : t('whatsapp.scopeMissingGlobal');
}

function formatDate(value: string | null): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
