export const ADMIN_DASHBOARD_LINKS = {
  leads: '/admin/leads',
  companies: '/admin/companies',
  proRegistry: '/admin/users?role=pro',
  unassignedPros: '/admin/users?role=pro&assignment=unassigned',
  finance: '/admin/finance',
  audit: '/admin/audit-logs',
} as const;
