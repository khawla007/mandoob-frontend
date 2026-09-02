import type { EmployeeRegistryResult } from './pro-employee-registry';

export function employeeRegistryDisplayState(result: EmployeeRegistryResult) {
  if (result.state === 'unavailable') return 'unavailable';
  if (result.state === 'partial' && result.rows.length === 0) return 'partial';
  if (result.state === 'no_results') return 'no_results';
  if (result.state === 'empty') return 'empty';
  if (result.rows.length === 0) return result.total === 0 ? 'empty' : 'no_results';
  return 'table';
}
