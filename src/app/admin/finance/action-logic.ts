import { z } from 'zod';
import type { FinanceActionResult } from '@/lib/finance/contracts';
import type { CompensationReceipt, ExpenseReceipt } from '@/lib/finance/repository';

type Actor = { id: string; role: 'admin' | 'super_admin'; aal: 'aal1' | 'aal2' | null };
type Scope = {
  tenantId: string;
  companyId: string;
  actorId: string;
  operationId: string;
  expectedVersion: number;
};
type ExpenseId = Scope & { expenseId: string };
type CompensationId = Scope & { compensationId: string };

export type AdminFinanceActionDependencies = {
  requireActor(): Promise<Actor>;
  createExpense(
    input: Scope & {
      sourceReference: string;
      description: string;
      amountMinor: number;
      currency: string;
    },
  ): Promise<FinanceActionResult<ExpenseReceipt>>;
  approveExpense(input: ExpenseId): Promise<FinanceActionResult<ExpenseReceipt>>;
  postExpense(
    input: ExpenseId & { settlementAccount: 'cash_clearing' | 'bank_clearing' },
  ): Promise<FinanceActionResult<ExpenseReceipt>>;
  reverseExpense(
    input: ExpenseId & { reason: string },
  ): Promise<FinanceActionResult<ExpenseReceipt>>;
  createCompensation(
    input: Scope & {
      proProfileId: string;
      sourceReference: string;
      amountMinor: number;
      currency: string;
    },
  ): Promise<FinanceActionResult<CompensationReceipt>>;
  approveCompensation(input: CompensationId): Promise<FinanceActionResult<CompensationReceipt>>;
  postCompensation(input: CompensationId): Promise<FinanceActionResult<CompensationReceipt>>;
  reverseCompensation(
    input: CompensationId & { reason: string },
  ): Promise<FinanceActionResult<CompensationReceipt>>;
  revalidate(path: string): void;
  reportError?(operation: string): void;
};

const uuid = z.string().uuid();
const base = z.object({ tenantId: uuid, companyId: uuid, operationId: uuid }).strict();
const versioned = base.extend({ expectedVersion: z.coerce.number().int().min(0) }).strict();
const createExpenseSchema = base
  .extend({
    sourceReference: z.string().trim().min(1).max(200),
    description: z.string().trim().min(1).max(500),
    amountMinor: z.coerce.number().int().min(1).max(100_000_000_000),
    currency: z.string().regex(/^[A-Z]{3}$/u),
  })
  .extend({ expectedVersion: z.coerce.number().int().min(0).default(0) })
  .strict();
const createCompensationSchema = base
  .extend({
    proProfileId: uuid,
    sourceReference: z.string().trim().min(1).max(200),
    amountMinor: z.coerce.number().int().min(1).max(100_000_000_000),
    currency: z.string().regex(/^[A-Z]{3}$/u),
  })
  .extend({ expectedVersion: z.coerce.number().int().min(0).default(0) })
  .strict();
const expenseSchema = versioned.extend({ expenseId: uuid }).strict();
const compensationSchema = versioned.extend({ compensationId: uuid }).strict();
const postExpenseSchema = expenseSchema
  .extend({ settlementAccount: z.enum(['cash_clearing', 'bank_clearing']) })
  .strict();
const reverseExpenseSchema = expenseSchema
  .extend({ reason: z.string().trim().min(3).max(500) })
  .strict();
const reverseCompensationSchema = compensationSchema
  .extend({ reason: z.string().trim().min(3).max(500) })
  .strict();

function values(data: FormData): Record<string, string> {
  return Object.fromEntries(
    [...data.entries()].map(([key, value]) => [key, typeof value === 'string' ? value : '']),
  );
}

async function run<T extends Record<string, unknown>, R>(
  data: FormData,
  schema: z.ZodType<T>,
  deps: AdminFinanceActionDependencies,
  operation: string,
  command: (input: T & { actorId: string }) => Promise<FinanceActionResult<R>>,
): Promise<FinanceActionResult<R>> {
  try {
    const actor = await deps.requireActor();
    if (actor.aal !== 'aal2') return { ok: false, code: 'FORBIDDEN' };
    const parsed = schema.safeParse(values(data));
    if (!parsed.success) return { ok: false, code: 'VALIDATION_FAILED' };
    const result = await command({ ...parsed.data, actorId: actor.id });
    if (!result.ok) return result;
    deps.revalidate('/admin/finance');
    deps.revalidate(`/admin/companies/${String(parsed.data.companyId)}`);
    return result;
  } catch {
    deps.reportError?.(operation);
    return { ok: false, code: 'UNAVAILABLE' };
  }
}

export const runCreateExpenseAction = (data: FormData, deps: AdminFinanceActionDependencies) =>
  run(data, createExpenseSchema, deps, 'admin.finance.create_expense', deps.createExpense);
export const runApproveExpenseAction = (data: FormData, deps: AdminFinanceActionDependencies) =>
  run(data, expenseSchema, deps, 'admin.finance.approve_expense', deps.approveExpense);
export const runPostExpenseAction = (data: FormData, deps: AdminFinanceActionDependencies) =>
  run(data, postExpenseSchema, deps, 'admin.finance.post_expense', deps.postExpense);
export const runReverseExpenseAction = (data: FormData, deps: AdminFinanceActionDependencies) =>
  run(data, reverseExpenseSchema, deps, 'admin.finance.reverse_expense', deps.reverseExpense);
export const runCreateCompensationAction = (data: FormData, deps: AdminFinanceActionDependencies) =>
  run(
    data,
    createCompensationSchema,
    deps,
    'admin.finance.create_compensation',
    deps.createCompensation,
  );
export const runApproveCompensationAction = (
  data: FormData,
  deps: AdminFinanceActionDependencies,
) =>
  run(
    data,
    compensationSchema,
    deps,
    'admin.finance.approve_compensation',
    deps.approveCompensation,
  );
export const runPostCompensationAction = (data: FormData, deps: AdminFinanceActionDependencies) =>
  run(data, compensationSchema, deps, 'admin.finance.post_compensation', deps.postCompensation);
export const runReverseCompensationAction = (
  data: FormData,
  deps: AdminFinanceActionDependencies,
) =>
  run(
    data,
    reverseCompensationSchema,
    deps,
    'admin.finance.reverse_compensation',
    deps.reverseCompensation,
  );
