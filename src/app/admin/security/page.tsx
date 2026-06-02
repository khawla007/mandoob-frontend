import { getTranslations } from 'next-intl/server';
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
  const t = await getTranslations('admin');
  const data = await loadSecurityDashboard();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t('security.title')}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{t('security.intro')}</p>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
        <Kpi
          label={t('security.kpiFailedLogins')}
          value={data.kpis.failedLogins24h}
          hint={t('security.kpiFailedLoginsHint')}
        />
        <Kpi
          label={t('security.kpiLockedAccounts')}
          value={data.kpis.lockedAccounts}
          hint={t('security.kpiLockedAccountsHint')}
        />
        <Kpi
          label={t('security.kpiLockedNetblocks')}
          value={data.kpis.lockedNetblocks}
          hint={t('security.kpiLockedNetblocksHint')}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">{t('security.lockedAccountsTitle')}</CardTitle>
          <CardDescription>{t('security.lockedAccountsDescription')}</CardDescription>
        </CardHeader>
        <CardContent>
          <LockedAccountsTable rows={data.lockedAccounts} />
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">{t('security.topIpsTitle')}</CardTitle>
            <CardDescription>{t('security.topIpsDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            {data.topFailedIps24h.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                {t('security.topIpsEmpty')}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('security.ip')}</TableHead>
                    <TableHead className="text-right">{t('security.failures')}</TableHead>
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
            <CardTitle className="text-lg">{t('security.mfaFailuresTitle')}</CardTitle>
            <CardDescription>{t('security.mfaFailuresDescription')}</CardDescription>
          </CardHeader>
          <CardContent>
            {data.recentMfaFailures.length === 0 ? (
              <p className="text-muted-foreground py-6 text-center text-sm">
                {t('security.mfaFailuresEmpty')}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('security.when')}</TableHead>
                    <TableHead>{t('security.user')}</TableHead>
                    <TableHead>{t('security.ip')}</TableHead>
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
