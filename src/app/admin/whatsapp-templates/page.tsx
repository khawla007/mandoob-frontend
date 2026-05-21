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
        <h1 className="text-2xl font-semibold tracking-tight">WhatsApp templates</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Track Meta approval state before templates are allowed into the outbound queue.
        </p>
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
              placeholder="Tenant UUID for overrides"
            />
            <select
              name="status"
              defaultValue={filters.status ?? 'all'}
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            >
              <option value="all">All statuses</option>
              <option value="missing">Missing</option>
              {WHATSAPP_TEMPLATE_APPROVAL_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {label(status)}
                </option>
              ))}
            </select>
            <select
              name="category"
              defaultValue={filters.category ?? 'all'}
              className="border-input bg-background h-9 rounded-md border px-3 text-sm"
            >
              <option value="all">All categories</option>
              {WHATSAPP_TEMPLATE_CATEGORIES.map((category) => (
                <option key={category} value={category}>
                  {label(category)}
                </option>
              ))}
            </select>
            <Button type="submit" variant="outline">
              Filter
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Template</TableHead>
                <TableHead>Scope</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Timestamps</TableHead>
                <TableHead>Notes</TableHead>
                <TableHead className="min-w-[360px]">Update</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={`${row.templateId}:${row.language}:${row.tenantId ?? 'global'}`}>
                  <TableCell className="whitespace-normal align-top">
                    <div className="font-medium">{row.templateId}</div>
                    <div className="text-muted-foreground mt-1 text-xs">
                      Meta: {row.metaTemplateName}
                    </div>
                    <div className="text-muted-foreground mt-1 flex flex-wrap gap-2 text-xs">
                      <span>{row.language}</span>
                      <span>{label(row.category)}</span>
                    </div>
                  </TableCell>
                  <TableCell className="whitespace-normal align-top">
                    <div className="font-medium">{scopeLabel(row, filters.tenantId)}</div>
                    {row.tenantId ?? filters.tenantId ? (
                      <div className="text-muted-foreground mt-1 break-all text-xs">
                        {row.tenantId ?? filters.tenantId}
                      </div>
                    ) : null}
                  </TableCell>
                  <TableCell className="align-top">
                    <StatusBadge status={row.status} />
                  </TableCell>
                  <TableCell className="whitespace-normal align-top text-xs">
                    <Timestamp label="Submitted" value={row.submittedAt} />
                    <Timestamp label="Checked" value={row.lastCheckedAt} />
                    <Timestamp label="Updated" value={row.updatedAt} />
                  </TableCell>
                  <TableCell className="max-w-[280px] whitespace-normal align-top text-sm">
                    <TextBlock label="Notes" value={row.notes} />
                    <TextBlock label="Rejection" value={row.rejectionReason} />
                  </TableCell>
                  <TableCell className="align-top">
                    <ApprovalForm row={row} tenantId={filters.tenantId ?? null} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          {rows.length === 0 ? (
            <div className="text-muted-foreground px-4 py-8 text-center text-sm">
              No WhatsApp templates match these filters.
            </div>
          ) : null}
        </CardContent>
      </Card>
    </div>
  );
}

function ApprovalForm({
  row,
  tenantId,
}: {
  row: WhatsAppTemplateApprovalViewRow;
  tenantId: string | null;
}) {
  const targetTenantId = row.tenantId ?? tenantId ?? '';
  return (
    <form
      action={updateWhatsAppTemplateApprovalAction as never}
      className="grid gap-2"
    >
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
              {label(status)}
            </option>
          ))}
        </select>
        <Input
          type="text"
          name="submittedAt"
          defaultValue={row.submittedAt ?? ''}
          placeholder="Submitted ISO timestamp"
          aria-label="Submitted ISO timestamp"
        />
      </div>
      <Input
        type="text"
        name="lastCheckedAt"
        defaultValue={row.lastCheckedAt ?? ''}
        placeholder="Last checked ISO timestamp"
        aria-label="Last checked ISO timestamp"
      />
      <Textarea name="notes" defaultValue={row.notes ?? ''} placeholder="Internal notes" />
      <Textarea
        name="rejectionReason"
        defaultValue={row.rejectionReason ?? ''}
        placeholder="Rejection reason"
      />
      <Button type="submit" size="sm">
        Save
      </Button>
    </form>
  );
}

function StatusBadge({ status }: { status: WhatsAppTemplateApprovalViewStatus }) {
  const variant =
    status === 'approved' ? 'default' : status === 'rejected' ? 'destructive' : 'secondary';
  return <Badge variant={variant}>{label(status)}</Badge>;
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

function scopeLabel(row: WhatsAppTemplateApprovalViewRow, tenantId: string | null | undefined): string {
  if (row.scope !== 'missing') return label(row.scope);
  return tenantId ? 'Missing tenant override' : 'Missing global row';
}

function formatDate(value: string | null): string {
  if (!value) return '-';
  return new Intl.DateTimeFormat('en', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}
