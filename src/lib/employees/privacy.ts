/** Field-level employee projection. Only masked last-4 values ever leave the server. */
export type EmployeeRecord = {
  id: string;
  version: number;
  name: string;
  email: string | null;
  phone: string | null;
  nationality: string | null;
  jobTitle: string | null;
  status: 'active' | 'inactive' | 'terminated';
  passportLast4: string | null;
  visaLast4: string | null;
  emiratesIdLast4: string | null;
  visaExpiry: string | null;
  eidExpiry: string | null;
};

export type EmployeeViewerRole = 'pro' | 'admin' | 'super_admin' | 'customer' | 'employee_self';

export type EmployeeView = {
  id: string;
  version: number;
  name: string;
  status: EmployeeRecord['status'];
  nationality: string | null;
  jobTitle: string | null;
  email: string | null;
  phone: string | null;
  passport: string | null;
  visa: string | null;
  emiratesId: string | null;
  visaExpiry: string | null;
  eidExpiry: string | null;
};

export function maskIdentifier(last4: string | null): string | null {
  return last4 ? `•••• ${last4}` : null;
}

export function projectEmployeeForRole(
  role: EmployeeViewerRole,
  record: EmployeeRecord,
): EmployeeView {
  const base = {
    id: record.id,
    version: record.version,
    name: record.name,
    status: record.status,
    nationality: record.nationality,
    jobTitle: record.jobTitle,
    visaExpiry: record.visaExpiry,
    eidExpiry: record.eidExpiry,
  };
  switch (role) {
    case 'pro':
    case 'admin':
    case 'super_admin':
    case 'employee_self':
      return {
        ...base,
        email: record.email,
        phone: record.phone,
        passport: maskIdentifier(record.passportLast4),
        visa: maskIdentifier(record.visaLast4),
        emiratesId: maskIdentifier(record.emiratesIdLast4),
      };
    case 'customer':
      return { ...base, email: null, phone: null, passport: null, visa: null, emiratesId: null };
    default:
      throw new Error('ROLE_NOT_PROJECTED');
  }
}
