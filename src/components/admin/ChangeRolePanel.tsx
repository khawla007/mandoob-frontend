'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
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
import { ClientTypeahead } from './ClientTypeahead';

type NewRole = 'pro' | 'customer' | 'employee' | 'admin';

const ALL_NEW_ROLES: { value: NewRole; label: string }[] = [
  { value: 'pro', label: 'PRO' },
  { value: 'customer', label: 'Customer' },
  { value: 'employee', label: 'Employee' },
  { value: 'admin', label: 'Admin' },
];

export function ChangeRolePanel({
  userId,
  currentRole,
  callerRole,
  callerTenantId,
  tenants,
}: {
  userId: string;
  currentRole: string;
  callerRole: 'super_admin' | 'admin';
  callerTenantId: string | null;
  tenants: TenantSummary[];
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [newRole, setNewRole] = useState<NewRole | ''>('');
  const [tenantId, setTenantId] = useState<string>(callerTenantId ?? '');
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
  const [linkedClientId, setLinkedClientId] = useState<string | null>(null);
  const [clientId, setClientId] = useState<string | null>(null);
  const [visaNo, setVisaNo] = useState('');
  const [visaExpiry, setVisaExpiry] = useState('');
  const [emiratesId, setEmiratesId] = useState('');
  const [eidExpiry, setEidExpiry] = useState('');

  const roleOptions = useMemo(
    () =>
      (callerRole === 'super_admin'
        ? ALL_NEW_ROLES
        : ALL_NEW_ROLES.filter((o) => o.value !== 'admin')
      ).filter((o) => o.value !== currentRole),
    [callerRole, currentRole],
  );

  const isSuperAdminTarget = currentRole === 'super_admin';
  const needsTenant = newRole !== '' && newRole !== 'admin';
  const tenantPickEnabled = callerRole === 'super_admin';

  function toggleArea(area: string) {
    setServiceAreas((s) => (s.includes(area) ? s.filter((x) => x !== area) : [...s, area]));
  }

  async function submit() {
    setError(null);
    if (!newRole) {
      setError('Pick a target role.');
      return;
    }
    if (isSuperAdminTarget && confirmation !== 'DEMOTE') {
      setError('Type DEMOTE to confirm super_admin demotion.');
      return;
    }

    const base: Record<string, unknown> = { newRole };
    if (newRole !== 'admin') base.tenant_id = tenantId || null;
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
        linked_client_id: linkedClientId,
      });
    } else if (newRole === 'employee') {
      if (!clientId) {
        setError('Pick a client for employee role.');
        return;
      }
      Object.assign(base, {
        client_id: clientId,
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
    setError(payload.error ?? `Request failed (${res.status})`);
  }

  if (currentRole === 'super_admin' && callerRole !== 'super_admin') {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">Change role</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Change role</DialogTitle>
          <DialogDescription>
            Current role: {currentRole}. Sessions will be revoked on save.
            {isSuperAdminTarget && ' Demoting a super_admin requires explicit confirmation.'}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Cannot change role</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label>New role</Label>
            <Select value={newRole} onValueChange={(v) => setNewRole(v as NewRole)}>
              <SelectTrigger>
                <SelectValue placeholder="Choose new role" />
              </SelectTrigger>
              <SelectContent>
                {roleOptions.map((o) => (
                  <SelectItem key={o.value} value={o.value}>
                    {o.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {needsTenant && (
            <div className="space-y-2">
              <Label>Tenant</Label>
              {tenantPickEnabled ? (
                <Select value={tenantId} onValueChange={setTenantId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Choose tenant" />
                  </SelectTrigger>
                  <SelectContent>
                    {tenants.map((t) => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              ) : (
                <Input
                  value={callerTenantId ?? ''}
                  disabled
                  readOnly
                  aria-label="Tenant (locked to your tenant)"
                />
              )}
            </div>
          )}

          {newRole === 'pro' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>License number</Label>
                <Input value={licenseNo} onChange={(e) => setLicenseNo(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Designation</Label>
                <Input value={designation} onChange={(e) => setDesignation(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Department</Label>
                <Input value={department} onChange={(e) => setDepartment(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Service areas</Label>
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
                      {area.replace(/_/g, ' ')}
                    </Toggle>
                  ))}
                </div>
              </div>
              <div className="space-y-2">
                <Label>Bio</Label>
                <Textarea rows={3} value={bio} onChange={(e) => setBio(e.target.value)} />
              </div>
            </div>
          )}

          {newRole === 'customer' && (
            <div className="space-y-3">
              <div className="space-y-2">
                <Label>Nationality (ISO-2)</Label>
                <Input
                  value={nationality}
                  maxLength={2}
                  onChange={(e) => setNationality(e.target.value.toUpperCase())}
                />
              </div>
              <div className="space-y-2">
                <Label>Passport number</Label>
                <Input value={passportNo} onChange={(e) => setPassportNo(e.target.value)} />
              </div>
              {tenantId && (
                <div className="space-y-2">
                  <Label>Linked client (optional)</Label>
                  <ClientTypeahead
                    tenantId={tenantId}
                    value={linkedClientId}
                    onChange={setLinkedClientId}
                  />
                </div>
              )}
            </div>
          )}

          {newRole === 'employee' && (
            <div className="space-y-3">
              {tenantId ? (
                <div className="space-y-2">
                  <Label>Client (required)</Label>
                  <ClientTypeahead
                    tenantId={tenantId}
                    value={clientId}
                    onChange={setClientId}
                    required
                  />
                </div>
              ) : (
                <div className="text-muted-foreground text-sm">
                  Pick a tenant first to enable client lookup.
                </div>
              )}
              <div className="space-y-2">
                <Label>Passport number</Label>
                <Input value={passportNo} onChange={(e) => setPassportNo(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Visa number</Label>
                <Input value={visaNo} onChange={(e) => setVisaNo(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Visa expiry (YYYY-MM-DD)</Label>
                <Input value={visaExpiry} onChange={(e) => setVisaExpiry(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Emirates ID</Label>
                <Input
                  value={emiratesId}
                  placeholder="784-YYYY-NNNNNNN-N"
                  onChange={(e) => setEmiratesId(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>EID expiry (YYYY-MM-DD)</Label>
                <Input value={eidExpiry} onChange={(e) => setEidExpiry(e.target.value)} />
              </div>
            </div>
          )}

          {isSuperAdminTarget && (
            <div className="space-y-2">
              <Label>Type DEMOTE to confirm</Label>
              <Input
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                placeholder="DEMOTE"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Reason (optional)</Label>
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
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting}>
            {submitting ? 'Saving…' : 'Apply'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
