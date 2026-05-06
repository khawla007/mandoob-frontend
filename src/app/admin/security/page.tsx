import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { LockedAccountsTable } from '@/components/admin/LockedAccountsTable';
import { requireRole } from '@/lib/auth/require-role';
import { loadSecurityDashboard } from '@/lib/data/security-dashboard';

export const dynamic = 'force-dynamic';

function fmt(iso: string): string {
  return new Date(iso).toISOString().replace('T', ' ').slice(0, 16) + 'Z';
}

export default async function SecurityPage() {
  await requireRole('super_admin');
  const data = await loadSecurityDashboard();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">MFA &amp; Security</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Failed-login + lockout dashboard. KPIs over the last 24 hours; lists capped per query.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Kpi
          label="Failed logins (24h)"
          value={data.kpis.failedLogins24h}
          hint="login_failure + mfa_challenge_failure"
        />
        <Kpi
          label="Locked accounts (now)"
          value={data.kpis.lockedAccounts}
          hint="auth_failed_attempts where key like acct:%"
        />
        <Kpi
          label="Locked netblocks (now)"
          value={data.kpis.lockedNetblocks}
          hint="auth_failed_attempts where key like net:%"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Currently locked accounts</CardTitle>
          <CardDescription>
            Click Unlock to clear the counter and lockout window. Audited to tenant_audit_log.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <LockedAccountsTable rows={data.lockedAccounts} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Top failed-login IPs (24h)</CardTitle>
            <CardDescription>Helps spot brute-force from one source.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.topFailedIps24h.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                No failed logins in the last 24 hours.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>IP</TableHead>
                    <TableHead className="text-right">Failures</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.topFailedIps24h.map((r) => (
                    <TableRow key={r.ip}>
                      <TableCell className="font-mono text-xs">{r.ip}</TableCell>
                      <TableCell className="text-right">{r.count}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Recent MFA failures (last 50)</CardTitle>
            <CardDescription>kind=mfa_challenge_failure, newest first.</CardDescription>
          </CardHeader>
          <CardContent>
            {data.recentMfaFailures.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                No recent MFA failures.
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>User</TableHead>
                    <TableHead>IP</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.recentMfaFailures.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="text-xs whitespace-nowrap">
                        {fmt(r.occurredAt)}
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {r.actorUserId ? r.actorUserId.slice(0, 8) : '—'}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{r.ip ?? '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Kpi({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{label}</CardDescription>
        <CardTitle className="text-3xl">{value}</CardTitle>
      </CardHeader>
      <CardContent className="text-muted-foreground text-xs">{hint}</CardContent>
    </Card>
  );
}
