import Link from 'next/link';
import { getTranslations } from 'next-intl/server';
import { requireRole } from '@/lib/auth/require-role';
import { listAdminErasureRequests } from '@/lib/data/erasure';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

export const dynamic = 'force-dynamic';

export default async function AdminErasureRequestsPage() {
  await requireRole('super_admin', 'admin');
  const t = await getTranslations('admin');
  const rows = await listAdminErasureRequests();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('erasure.list.title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('erasure.list.intro')}</p>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t('erasure.list.subject')}</TableHead>
                <TableHead>{t('erasure.list.tenant')}</TableHead>
                <TableHead>{t('erasure.list.status')}</TableHead>
                <TableHead>{t('erasure.list.submitted')}</TableHead>
                <TableHead className="text-right">{t('erasure.list.action')}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">{row.subjectName ?? row.subjectUserId}</div>
                    <div className="text-muted-foreground text-xs">
                      {t.has(`erasure.subjectKind.${row.subjectKind}`)
                        ? t(`erasure.subjectKind.${row.subjectKind}`)
                        : row.subjectKind}
                    </div>
                  </TableCell>
                  <TableCell>{row.tenantName ?? row.subjectTenantId}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">
                      {t.has(`erasure.status.${row.status}`)
                        ? t(`erasure.status.${row.status}`)
                        : row.status.replaceAll('_', ' ')}
                    </Badge>
                  </TableCell>
                  <TableCell>{new Date(row.submittedAt).toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/erasure-requests/${row.id}`}>
                        {t('erasure.list.review')}
                      </Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground py-8 text-center">
                    {t('erasure.list.empty')}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
