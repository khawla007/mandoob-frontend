import { getLocale, getTranslations } from 'next-intl/server';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { roleBadgeVariant, statusBadgeVariant } from './role-badge';
import { EditUserForm } from './EditUserForm';
import { ChangeRolePanel } from './ChangeRolePanel';
import { ChangeStatusPanel } from './ChangeStatusPanel';
import { ResetMfaButton } from './ResetMfaButton';
import { ResyncRoleMetadataButton } from './ResyncRoleMetadataButton';
import { VerifyProCredentialsButton } from './VerifyProCredentialsButton';
import type { EditableUser } from '@/lib/data/admin-read-user';
import type { TenantSummary } from '@/lib/data/tenants';

export type EditUserPanelProps = {
  user: EditableUser;
  tenantName: string | null;
  tenants: TenantSummary[];
};

export async function EditUserPanel({ user, tenantName, tenants }: EditUserPanelProps) {
  const { profile } = user;
  const [t, locale] = await Promise.all([getTranslations('admin'), getLocale()]);
  const verifiedAt =
    user.role === 'pro' && user.pro.verifiedAt && !Number.isNaN(Date.parse(user.pro.verifiedAt))
      ? new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(
          new Date(user.pro.verifiedAt),
        )
      : null;
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
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <Badge variant={user.pro.credentialsVerified ? 'default' : 'outline'}>
                {user.pro.credentialsVerified
                  ? t('user.credentials.statusVerified')
                  : t('user.credentials.statusUnverified')}
              </Badge>
              {verifiedAt ? (
                <span className="text-muted-foreground">
                  {t('user.credentials.verifiedAt', { value: verifiedAt })}
                </span>
              ) : null}
            </div>
            <VerifyProCredentialsButton
              userId={profile.id}
              verified={user.pro.credentialsVerified}
              expectedUpdatedAt={user.pro.updatedAt}
            />
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
