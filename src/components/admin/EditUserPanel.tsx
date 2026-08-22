import { getTranslations } from 'next-intl/server';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { roleBadgeVariant, statusBadgeVariant } from './role-badge';
import { EditUserForm } from './EditUserForm';
import { ChangeRolePanel } from './ChangeRolePanel';
import { ChangeStatusPanel } from './ChangeStatusPanel';
import { ResetMfaButton } from './ResetMfaButton';
import { ResyncRoleMetadataButton } from './ResyncRoleMetadataButton';
import type { EditableUser } from '@/lib/data/admin-read-user';
import type { TenantSummary } from '@/lib/data/tenants';

export type EditUserPanelProps = {
  user: EditableUser;
  tenantName: string | null;
  tenants: TenantSummary[];
};

export async function EditUserPanel({ user, tenantName, tenants }: EditUserPanelProps) {
  const { profile } = user;
  const t = await getTranslations('admin');
  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{profile.fullName ?? profile.email ?? t('user.unnamedUser')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 text-sm">
          <Badge variant={roleBadgeVariant[profile.role]}>{t(`enums.role.${profile.role}`)}</Badge>
          <Badge variant={statusBadgeVariant[profile.status]}>
            {t(`enums.status.${profile.status}`)}
          </Badge>
          {profile.email ? <span className="text-muted-foreground">{profile.email}</span> : null}
          {profile.suspensionReason ? (
            <span className="text-destructive">
              {t('user.suspensionReason', { reason: profile.suspensionReason })}
            </span>
          ) : null}
        </CardContent>
      </Card>

      <EditUserForm user={user} tenantName={tenantName} />

      {user.role === 'pro' ? (
        <Card>
          <CardHeader>
            <CardTitle>{t('user.credentials.title')}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground mb-3 text-sm">
              {t('user.credentials.lifecycleLinkHelp')}
            </p>
            <Button asChild variant="outline">
              <Link href={`/admin/users/${profile.id}`}>{t('user.credentials.openLifecycle')}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{t('user.lifecycleActionsTitle')}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <ChangeRolePanel userId={profile.id} currentRole={profile.role} tenants={tenants} />
          <ChangeStatusPanel userId={profile.id} currentStatus={profile.status} />
          <ResetMfaButton userId={profile.id} mfaEnrolled={Boolean(profile.mfaEnrolledAt)} />
          <ResyncRoleMetadataButton userId={profile.id} />
        </CardContent>
      </Card>
    </div>
  );
}
