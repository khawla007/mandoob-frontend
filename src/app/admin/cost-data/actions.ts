'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireAal2, requireRole } from '@/lib/auth/require-role';
import {
  createCostDataRow,
  importCostDataRows,
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

async function requireCostDataAdmin() {
  const session = await requireRole('super_admin', 'admin');
  await requireAal2(session);
  return session;
}

const mutationMetaSchema = z.object({
  operationId: z.string().uuid(),
  expectedVersion: z.coerce.number().int().positive().optional(),
});

function revalidateCostData(): void {
  revalidatePath('/admin/cost-data');
  revalidatePath('/api/v1/public/catalog/authorities');
  revalidatePath('/api/v1/public/catalog/activities');
  revalidatePath('/api/v1/public/catalog/packages');
  revalidatePath('/api/v1/public/catalog/costs');
  revalidatePath('/sitemap.xml');
}

export async function createCostDataAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireCostDataAdmin();
    const meta = mutationMetaSchema.safeParse(raw);
    const parsed = createCostDataSchema.safeParse(raw);
    if (!parsed.success || !meta.success) {
      return { ok: false, error: 'Invalid cost-data mutation request', code: 'VALIDATION_FAILED' };
    }
    const row = await createCostDataRow(parsed.data, {
      actorId: session.id,
      operationId: meta.data.operationId,
    });
    console.info('cost_data_created', { id: row.id });
    revalidateCostData();
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    console.error('createCostDataAction failed', error);
    return { ok: false, error: 'Could not create cost-data row', code: 'INTERNAL' };
  }
}

export async function updateCostDataAction(raw: unknown): Promise<ActionResult<{ id: string }>> {
  try {
    const session = await requireCostDataAdmin();
    const meta = mutationMetaSchema.required({ expectedVersion: true }).safeParse(raw);
    const parsed = updateCostDataSchema.safeParse(raw);
    if (!parsed.success || !meta.success) {
      return { ok: false, error: 'Invalid cost-data mutation request', code: 'VALIDATION_FAILED' };
    }
    const { id, ...input } = parsed.data;
    const row = await updateCostDataRow(id, input, {
      actorId: session.id,
      operationId: meta.data.operationId,
      expectedVersion: meta.data.expectedVersion,
    });
    console.info('cost_data_updated', { id: row.id });
    revalidateCostData();
    return { ok: true, data: { id: row.id } };
  } catch (error) {
    console.error('updateCostDataAction failed', error);
    return { ok: false, error: 'Could not update cost-data row', code: 'INTERNAL' };
  }
}

export async function toggleCostDataAction(raw: unknown): Promise<ActionResult> {
  try {
    const session = await requireCostDataAdmin();
    const meta = mutationMetaSchema.required({ expectedVersion: true }).safeParse(raw);
    const parsed = toggleCostDataSchema.safeParse(raw);
    if (!parsed.success || !meta.success) {
      return { ok: false, error: 'Invalid cost-data mutation request', code: 'VALIDATION_FAILED' };
    }
    await setCostDataActive(parsed.data.id, parsed.data.active, {
      actorId: session.id,
      operationId: meta.data.operationId,
      expectedVersion: meta.data.expectedVersion,
    });
    console.info('cost_data_status_changed', { id: parsed.data.id, active: parsed.data.active });
    revalidateCostData();
    return { ok: true, data: undefined };
  } catch (error) {
    console.error('toggleCostDataAction failed', error);
    return { ok: false, error: 'Could not update cost-data status', code: 'INTERNAL' };
  }
}

export async function importCostDataCsvAction(
  raw: unknown,
): Promise<ActionResult<{ inserted: number; errors: string[] }>> {
  try {
    const session = await requireCostDataAdmin();
    const meta = mutationMetaSchema.safeParse(raw);
    const csv = typeof raw === 'object' && raw !== null && 'csv' in raw ? String(raw.csv) : '';
    const parsed = parseCostDataCsv(csv);
    if (!parsed.ok || !meta.success) {
      return {
        ok: false,
        error: parsed.ok
          ? 'Invalid cost-data mutation request'
          : parsed.errors.slice(0, 3).join('; '),
        code: 'VALIDATION_FAILED',
      };
    }
    const result = await importCostDataRows(parsed.rows, {
      actorId: session.id,
      operationId: meta.data.operationId,
    });
    console.info('cost_data_csv_imported', { inserted: result.inserted });
    revalidateCostData();
    return { ok: true, data: { inserted: result.inserted, errors: [] } };
  } catch (error) {
    console.error('importCostDataCsvAction failed', error);
    return { ok: false, error: 'Could not import cost-data CSV', code: 'INTERNAL' };
  }
}
