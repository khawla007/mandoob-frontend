'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Toggle } from '@/components/ui/toggle';
import { postJson } from '@/lib/http/post';
import { SERVICE_AREA_VALUES } from '@/lib/validation/admin-user';
import type { TenantSummary } from '@/lib/data/tenants';
import { CompanyTypeahead } from './CompanyTypeahead';

type NewRole = 'pro' | 'customer' | 'employee' | 'admin';

const ALL_NEW_ROLES: NewRole[] = ['pro', 'customer', 'employee', 'admin'];

export function ChangeRolePanel({
  userId,
  currentRole,
  tenants,
}: {
  userId: string;
  currentRole: string;
  tenants: TenantSummary[];
}) {
  const t = useTranslations('admin');
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newRole, setNewRole] = useState<NewRole | ''>('');
  const [tenantId, setTenantId] = useState<string>('');
  const [confirmation, setConfirmation] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Per-role state
  const [licenseNo, setLicenseNo] = useState('');
  const [designation, setDesignation] = useState('');
  const [department, setDepartment] = useState('');
  const [serviceAreas, setServiceAreas] = useState<string[]>([]);
  const [bio, setBio] = useState('');
  const [nationality, setNationality] = useState('');
  const [passportNo, setPassportNo] = useState('');
  const [linkedCompanyId, setLinkedCompanyId] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [visaNo, setVisaNo] = useState('');
  const [visaExpiry, setVisaExpiry] = useState('');
  const [emiratesId, setEmiratesId] = useState('');
  const [eidExpiry, setEidExpiry] = useState('');

  const roleOptions = useMemo(
    () => ALL_NEW_ROLES.filter((role) => role !== currentRole),
    [currentRole],
  );

  const isSuperAdminTarget = currentRole === 'super_admin';
  // PRO identities remain tenantless until the verified assignment RPC scopes them.
  const needsTenant = newRole !== '' && newRole !== 'admin' && newRole !== 'pro';

  function toggleArea(area: string) {
    setServiceAreas((s) => (s.includes(area) ? s.filter((x) => x !== area) : [...s, area]));
  }

  async function submit() {
    setError(null);
    if (!newRole) {
      setError(t('user.roleChange.errPickRole'));
      return;
    }
    if (isSuperAdminTarget && confirmation !== 'DEMOTE') {
      setError(t('user.roleChange.errTypeDemote'));
      return;
    }

    const base: Record<string, unknown> = { newRole };
    if (newRole === 'pro') base.tenant_id = null;
    else if (newRole !== 'admin') base.tenant_id = tenantId || null;
    if (isSuperAdminTarget) base.confirmation = 'DEMOTE';
    if (reason.trim()) base.reason = reason.trim();

    if (newRole === 'pro') {
      Object.assign(base, {
        license_no: licenseNo.trim(),
        designation: designation || null,
        department: department || null,
        service_areas: serviceAreas,
        bio: bio || null,
      });
    } else if (newRole === 'customer') {
      Object.assign(base, {
        nationality: nationality || null,
        passport_no: passportNo || null,
        linked_company_id: linkedCompanyId,
      });
    } else if (newRole === 'employee') {
      if (!companyId) {
        setError(t('user.roleChange.errPickCompany'));
        return;
      }
      Object.assign(base, {
        company_id: companyId,
        passport_no: passportNo || null,
        visa_no: visaNo || null,
        visa_expiry: visaExpiry || null,
        emirates_id: emiratesId || null,
        eid_expiry: eidExpiry || null,
      });
    }

    setSubmitting(true);
    const res = await postJson(`/api/v1/admin/users/${userId}/role`, base);
    setSubmitting(false);
    if (res.ok) {
      setOpen(false);
      setNewRole('');
      setConfirmation('');
      setReason('');
      router.refresh();
      return;
    }
    let payload: { error?: string } = {};
    try {
      payload = await res.json();
    } catch {
      // ignore
    }
    setError(payload.error ?? t('user.requestFailed', { status: res.status }));
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">{t('user.roleChange.trigger')}</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t('user.roleChange.title')}</DialogTitle>
          <DialogDescription>
            {t('user.roleChange.description', { role: t(`enums.role.${currentRole}`) })}
            {isSuperAdminTarget && ` ${t('user.roleChange.superAdminWarning')}`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {error && (
            <Alert variant="destructive">
              <AlertTitle>{t('user.roleChange.errorTitle')}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label>{t('user.roleChange.newRoleLabel')}</Label>
            <Select value={newRole} onValueChange={(v) => setNewRole(v as NewRole)}>
              <SelectTrigger>
                <SelectValue placeholder={t('user.roleChange.newRolePlaceholder')} />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((r) => (
                  <SelectItem key={r} value={r}>
                    {t(`enums.role.${r}`)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {needsTenant && (
            <div className="space-y-2">
              <Label>{t('user.fields.tenant')}</Label>
              <Select value={tenantId} onValueChange={setTenantId}>
                <SelectTrigger>
                  <SelectValue placeholder={t('user.roleChange.tenantPlaceholder')} />
                </SelectTrigger>
                <SelectContent>
                  {tenants.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {newRole === 'pro' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>{t('user.fields.licenseNo')}</Label>
                <Input value={licenseNo} onChange={(e) => setLicenseNo(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('user.fields.designation')}</Label>
                <Input value={designation} onChange={(e) => setDesignation(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('user.fields.department')}</Label>
                <Input value={department} onChange={(e) => setDepartment(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('user.fields.serviceAreasLabel')}</Label>
                <div className="flex flex-wrap gap-2">
                  {SERVICE_AREA_VALUES.map((area) => (
                    <Toggle
                      key={area}
                      type="button"
                      pressed={serviceAreas.includes(area)}
                      onPressedChange={() => toggleArea(area)}
                      variant="outline"
                      size="sm"
                    >
                      {t(`user.serviceAreas.${area}`)}
                    </Toggle>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>{t('user.fields.bio')}</Label>
                <Textarea rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
              </div>
            </div>
          )}

          {newRole === 'customer' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>{t('user.fields.nationality')}</Label>
                <Input
                  value={nationality}
                  maxLength={2}
                  onChange={(e) => setNationality(e.target.value.toUpperCase())}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('user.fields.passportNo')}</Label>
                <Input value={passportNo} onChange={(e) => setPassportNo(e.target.value)} />
              </div>
              {tenantId && (
                <div className="space-y-2">
                  <Label htmlFor="change-role-linked-company">
                    {t('user.fields.linkedCompany')}
                  </Label>
                  <CompanyTypeahead
                    id="change-role-linked-company"
                    tenantId={tenantId}
                    value={linkedCompanyId}
                    onChange={setLinkedCompanyId}
                    accessibleLabel={t('user.fields.linkedCompany')}
                  />
                </div>
              )}
            </div>
          )}

          {newRole === 'employee' && (
            <div className="space-y-3">
              {tenantId ? (
                <div className="space-y-2">
                  <Label htmlFor="change-role-employer-company">
                    {t('user.roleChange.companyRequiredLabel')}
                  </Label>
                  <CompanyTypeahead
                    id="change-role-employer-company"
                    tenantId={tenantId}
                    value={companyId}
                    onChange={setCompanyId}
                    accessibleLabel={t('user.roleChange.companyRequiredLabel')}
                    required
                  />
                </div>
              ) : (
                <div className="text-muted-foreground text-sm">
                  {t('user.roleChange.pickTenantBeforeCompany')}
                </div>
              )}
              <div className="space-y-2">
                <Label>{t('user.fields.passportNo')}</Label>
                <Input value={passportNo} onChange={(e) => setPassportNo(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('user.fields.visaNo')}</Label>
                <Input value={visaNo} onChange={(e) => setVisaNo(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('user.fields.visaExpiry')}</Label>
                <Input value={visaExpiry} onChange={(e) => setVisaExpiry(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>{t('user.fields.emiratesId')}</Label>
                <Input
                  value={emiratesId}
                  placeholder="784-YYYY-NNNNNNN-N"
                  onChange={(e) => setEmiratesId(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>{t('user.fields.eidExpiry')}</Label>
                <Input value={eidExpiry} onChange={(e) => setEidExpiry(e.target.value)} />
              </div>
            </div>
          )}

          {isSuperAdminTarget && (
            <div className="space-y-2">
              <Label>{t('user.roleChange.confirmLabel')}</Label>
              <Input
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder="DEMOTE"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>{t('user.fields.reason')}</Label>
            <Textarea
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              maxLength={500}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            {t('user.cancel')}
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? t('user.saving') : t('user.roleChange.apply')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
