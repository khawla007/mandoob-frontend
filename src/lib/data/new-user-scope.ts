type NewUserScopeInput = {
  role: 'admin' | 'pro' | 'customer' | 'employee';
  tenant_id?: string | null;
};

export function tenantScopeForNewUser(input: NewUserScopeInput): string | null {
  return input.role === 'admin' || input.role === 'pro' ? null : (input.tenant_id ?? null);
}
