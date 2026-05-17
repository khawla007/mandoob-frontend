import Link from 'next/link';
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
  const rows = await listAdminErasureRequests();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Erasure requests</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Verified PDPL right-to-erasure requests awaiting review.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Subject</TableHead>
                <TableHead>Tenant</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead className="text-right">Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell>
                    <div className="font-medium">{row.subjectName ?? row.subjectUserId}</div>
                    <div className="text-muted-foreground text-xs">{row.subjectKind}</div>
                  </TableCell>
                  <TableCell>{row.tenantName ?? row.subjectTenantId}</TableCell>
                  <TableCell>
                    <Badge variant="secondary">{row.status.replaceAll('_', ' ')}</Badge>
                  </TableCell>
                  <TableCell>{new Date(row.submittedAt).toLocaleString()}</TableCell>
                  <TableCell className="text-right">
                    <Button asChild size="sm" variant="outline">
                      <Link href={`/admin/erasure-requests/${row.id}`}>Review</Link>
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {rows.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-muted-foreground py-8 text-center">
                    No verified erasure requests are waiting for review.
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
