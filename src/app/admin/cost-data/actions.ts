'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { requireRole } from '@/lib/auth/require-role';
import {
  createCostDataRow,
  setCostDataActive,
  updateCostDataRow,
} from '@/lib/data/cost-data';
import {
  createCostDataSchema,
  parseCostDataCsv,
  toggleCostDataSchema,
  updateCostDataSchema,
} from '@/lib/validation/cost-data';

export type ActionResult<T = void> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

export async function createCostDataAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole('super_admin', 'admin');
    const parsed = createCostDataSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message, code: 'VALIDATION_FAILED' };
    }
    const row = await createCostDataRow(parsed.data);
    console.info('cost_data_created', { id: row.id, authority: row.authority, feeType: row.feeType });
    revalidatePath('/admin/cost-data');
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    console.error('createCostDataAction failed', error);
    return { ok: false, error: 'Could not create cost-data row', code: 'INTERNAL' };
  }
}

export async function updateCostDataAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    await requireRole('super_admin', 'admin');
    const parsed = updateCostDataSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message, code: 'VALIDATION_FAILED' };
    }
    const { id, ...input } = parsed.data;
    const row = await updateCostDataRow(id, input);
    console.info('cost_data_updated', { id: row.id, authority: row.authority, feeType: row.feeType });
    revalidatePath('/admin/cost-data');
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    console.error('updateCostDataAction failed', error);
    return { ok: false, error: 'Could not update cost-data row', code: 'INTERNAL' };
  }
}

export async function toggleCostDataAction(raw: unknown): Promise<ActionResult> {
  try {
    await requireRole('super_admin', 'admin');
    const parsed = toggleCostDataSchema.safeParse(raw);
    if (!parsed.success) {
      return { ok: false, error: parsed.error.issues[0].message, code: 'VALIDATION_FAILED' };
    }
    await setCostDataActive(parsed.data.id, parsed.data.active);
    console.info('cost_data_status_changed', parsed.data);
    revalidatePath('/admin/cost-data');
    return { ok: true, data: undefined };
  } catch (error) {
    console.error('toggleCostDataAction failed', error);
    return { ok: false, error: 'Could not update cost-data status', code: 'INTERNAL' };
  }
}

export async function importCostDataCsvAction(raw: unknown): Promise<ActionResult<{ inserted: number; errors: string[] }>> {
  try {
    await requireRole('super_admin', 'admin');
    const csv = typeof raw === 'object' && raw !== null && 'csv' in raw ? String(raw.csv) : '';
    const parsed = parseCostDataCsv(csv);
    if (!parsed.ok) {
      return { ok: false, error: parsed.errors.slice(0, 3).join('; '), code: 'VALIDATION_FAILED' };
    }

    let inserted = 0;
    const errors: string[] = [];
    for (const [index, row] of parsed.rows.entries()) {
      try {
        await createCostDataRow(row);
        inserted += 1;
      } catch {
        errors.push(`Row ${index + 2}: insert failed`);
      }
    }
    console.info('cost_data_csv_imported', { inserted, errors: errors.length });
    revalidatePath('/admin/cost-data');
    return { ok: true, data: { inserted, errors } };
  } catch (error) {
    console.error('importCostDataCsvAction failed', error);
    return { ok: false, error: 'Could not import cost-data CSV', code: 'INTERNAL' };
  }
}
