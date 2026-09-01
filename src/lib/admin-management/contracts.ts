export type AdminManagementDependency = 'phase-3' | 'p2-09' | 'p2-10';

export type AdminSourceState<T> =
  | { state: 'data'; value: T; generatedAt: string }
  | { state: 'empty'; generatedAt: string }
  | {
      state: 'unavailable';
      dependency: AdminManagementDependency;
      contract: string;
    }
  | { state: 'partial'; value: T; unavailable: readonly string[]; generatedAt: string }
  | { state: 'error'; reason: 'sanitized' }
  | { state: 'permission' };

export type AdminActionContract =
  | { state: 'enabled'; href: string }
  | {
      state: 'unavailable';
      dependency: AdminManagementDependency;
      explanation: string;
    };

export function phase3UnavailableSource(
  contract: string,
): AdminSourceState<never> & { state: 'unavailable' } {
  return { state: 'unavailable', dependency: 'phase-3', contract };
}

export function adminActionIsEnabled(
  action: AdminActionContract,
): action is Extract<AdminActionContract, { state: 'enabled' }> {
  return action.state === 'enabled';
}
