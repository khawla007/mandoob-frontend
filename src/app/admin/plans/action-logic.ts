import { z } from 'zod';

type Result =
  | { ok: true; versionId: string; replayed: boolean }
  | {
      ok: false;
      code:
        | 'FORBIDDEN'
        | 'VALIDATION_FAILED'
        | 'ACTIVE_IMMUTABLE'
        | 'EFFECTIVE_OVERLAP'
        | 'CONFLICT'
        | 'UNAVAILABLE';
    };
type Actor = { id: string; aal: 'aal1' | 'aal2' | null };
type Base = { operationId: string; reviewReference: string };
export type AdminPlanActionDependencies = {
  requireActor(): Promise<Actor>;
  clone(input: Base & { actorId: string; sourceVersionId: string }): Promise<Result>;
  edit(
    input: Base & {
      actorId: string;
      versionId: string;
      expectedRevision: number;
      patch: { label?: string };
    },
  ): Promise<Result>;
  activate(
    input: Base & {
      actorId: string;
      versionId: string;
      expectedRevision: number;
      effectiveFrom: string;
    },
  ): Promise<Result>;
  revalidate(path: string): void;
};
const base = z.object({
  operationId: z.string().uuid(),
  reviewReference: z.string().trim().min(3).max(120),
});
const cloneSchema = base.extend({ sourceVersionId: z.string().uuid() }).strict();
const editSchema = base
  .extend({
    versionId: z.string().uuid(),
    expectedRevision: z.number().int().nonnegative(),
    patch: z.object({ label: z.string().trim().min(1).max(120).optional() }).strict(),
  })
  .strict();
const activateSchema = base
  .extend({
    versionId: z.string().uuid(),
    expectedRevision: z.number().int().nonnegative(),
    effectiveFrom: z.string().datetime({ offset: true }),
  })
  .strict();

async function run<T>(
  raw: unknown,
  schema: z.ZodType<T>,
  deps: AdminPlanActionDependencies,
  command: (input: T & { actorId: string }) => Promise<Result>,
): Promise<Result> {
  try {
    const actor = await deps.requireActor();
    if (actor.aal !== 'aal2') return { ok: false, code: 'FORBIDDEN' };
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return { ok: false, code: 'VALIDATION_FAILED' };
    const result = await command({ ...parsed.data, actorId: actor.id });
    if (result.ok) deps.revalidate('/admin/plans');
    return result;
  } catch {
    return { ok: false, code: 'UNAVAILABLE' };
  }
}
export const runCloneCatalogAction = (raw: unknown, deps: AdminPlanActionDependencies) =>
  run(raw, cloneSchema, deps, deps.clone);
export const runEditCatalogAction = (raw: unknown, deps: AdminPlanActionDependencies) =>
  run(raw, editSchema, deps, deps.edit);
export const runActivateCatalogAction = (raw: unknown, deps: AdminPlanActionDependencies) =>
  run(raw, activateSchema, deps, deps.activate);
