import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { ProFirmDetailHeader } from '@/components/admin/ProFirmDetailHeader';
import { requireRole } from '@/lib/auth/require-role';
import { getProFirmDetail } from '@/lib/data/pro-firm-detail';

export const dynamic = 'force-dynamic';

const idSchema = z.string().uuid();

function fmtDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toISOString().slice(0, 10);
}

export default async function ProFirmDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireRole('super_admin');
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();

  const data = await getProFirmDetail(id);
  if (!data) notFound();

  return (
    <div className="space-y-6">
      <ProFirmDetailHeader tenant={data.tenant} />

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Members</CardTitle>
            <CardDescription>{data.members.length} profile(s) in this tenant.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.members.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">No members.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Last login</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.members.map((m) => (
                    <TableRow key={m.id}>
                      <TableCell>
                        <Link
                          href={`/admin/users/${m.id}/edit`}
                          className="underline-offset-4 hover:underline"
                        >
                          {m.fullName ?? <em>—</em>}
                        </Link>
                      </TableCell>
                      <TableCell>{m.role && <Badge variant="outline">{m.role}</Badge>}</TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {fmtDate(m.lastLoginAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Clients</CardTitle>
            <CardDescription>
              Total {data.clientsSummary.total}. Showing {data.clientsSummary.recent.length} most
              recent.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {data.clientsSummary.recent.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">No clients yet.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Company</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Created</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.clientsSummary.recent.map((c) => (
                    <TableRow key={c.id}>
                      <TableCell className="text-sm">{c.companyName}</TableCell>
                      <TableCell>
                        {c.status && <Badge variant="outline">{c.status}</Badge>}
                      </TableCell>
                      <TableCell className="text-xs whitespace-nowrap">
                        {fmtDate(c.createdAt)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Recent audit (last 10)</CardTitle>
          <CardDescription>
            Tenant-scoped events.{' '}
            <Link
              href={`/admin/audit-logs?kind=tenant_audit&tenant=${data.tenant.id}`}
              className="underline-offset-4 hover:underline"
            >
              See all →
            </Link>
          </CardDescription>
        </CardHeader>
        <CardContent>
          {data.recentAudit.length === 0 ? (
            <p className="text-muted-foreground py-6 text-center text-sm">No audit entries yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-44">When</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Source</TableHead>
                  <TableHead>Actor</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recentAudit.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell className="font-mono text-xs whitespace-nowrap">
                      {new Date(a.createdAt).toISOString().replace('T', ' ').slice(0, 19)}Z
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{a.action}</Badge>
                    </TableCell>
                    <TableCell className="text-xs">{a.source ?? '—'}</TableCell>
                    <TableCell className="font-mono text-xs">
                      {a.actorId ? a.actorId.slice(0, 8) : '—'}
                    </TableCell>
                    <TableCell className="text-muted-foreground max-w-md truncate text-xs">
                      {a.details ? JSON.stringify(a.details).slice(0, 120) : '—'}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Billing</CardTitle>
          <CardDescription>Pending — Step 23.</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            Subscription plan, invoices, and payment history will land with the Payment &amp;
            Financial module.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
