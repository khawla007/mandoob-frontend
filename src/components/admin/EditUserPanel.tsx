import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { roleBadgeVariant, statusBadgeVariant } from './role-badge';
import { EditUserForm } from './EditUserForm';
import { ChangeRolePanel } from './ChangeRolePanel';
import { ChangeStatusPanel } from './ChangeStatusPanel';
import { ResetMfaButton } from './ResetMfaButton';
import type { EditableUser } from '@/lib/data/admin-read-user';
import type { TenantSummary } from '@/lib/data/tenants';

export type EditUserPanelProps = {
  user: EditableUser;
  callerRole: 'super_admin' | 'admin';
  callerTenantId: string | null;
  tenantName: string | null;
  tenants: TenantSummary[];
};

export function EditUserPanel({
  user,
  callerRole,
  callerTenantId,
  tenantName,
  tenants,
}: EditUserPanelProps) {
  const { profile } = user;
  return (
    <div className="max-w-3xl space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{profile.fullName ?? profile.email ?? 'Unnamed user'}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3 text-sm">
          <Badge variant={roleBadgeVariant[profile.role]}>{profile.role}</Badge>
          <Badge variant={statusBadgeVariant[profile.status]}>{profile.status}</Badge>
          {profile.email ? <span className="text-muted-foreground">{profile.email}</span> : null}
          {profile.suspensionReason ? (
            <span className="text-destructive">Suspension reason: {profile.suspensionReason}</span>
          ) : null}
        </CardContent>
      </Card>

      <EditUserForm
        user={user}
        callerRole={callerRole}
        callerTenantId={callerTenantId}
        tenantName={tenantName}
      />

      <Card>
        <CardHeader>
          <CardTitle>Lifecycle actions</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-3">
          <ChangeRolePanel
            userId={profile.id}
            currentRole={profile.role}
            callerRole={callerRole}
            callerTenantId={callerTenantId}
            tenants={tenants}
          />
          <ChangeStatusPanel userId={profile.id} currentStatus={profile.status} />
          <ResetMfaButton userId={profile.id} mfaEnrolled={Boolean(profile.mfaEnrolledAt)} />
        </CardContent>
      </Card>
    </div>
  );
}
