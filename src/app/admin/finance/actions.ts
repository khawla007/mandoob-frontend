'use server';

import 'server-only';
import { revalidatePath } from 'next/cache';
import { logSafeActionError } from '@/lib/actions/server-action-security';
import { requirePlatformOperator } from '@/lib/auth/require-role';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';
import {
  approveCompensation,
  approveExpense,
  createCompensationDraft,
  createExpenseDraft,
  postCompensation,
  postExpense,
  reverseCompensation,
  reverseExpense,
} from '@/lib/finance/repository';
import {
  runApproveCompensationAction,
  runApproveExpenseAction,
  runCreateCompensationAction,
  runCreateExpenseAction,
  runPostCompensationAction,
  runPostExpenseAction,
  runReverseCompensationAction,
  runReverseExpenseAction,
  type AdminFinanceActionDependencies,
} from './action-logic';
import { openBankEvidence, reviewBankEvidence } from '@/lib/finance/bank-evidence-review';
import { z } from 'zod';

const rpc = () =>
  createSupabaseServiceRoleClient() as unknown as Parameters<typeof createExpenseDraft>[0];
const dependencies: AdminFinanceActionDependencies = {
  async requireActor() {
    const actor = await requirePlatformOperator();
    return { id: actor.id, role: actor.role as 'admin' | 'super_admin', aal: actor.aal };
  },
  createExpense: (input) => createExpenseDraft(rpc(), input),
  approveExpense: (input) => approveExpense(rpc(), input),
  postExpense: (input) => postExpense(rpc(), input),
  reverseExpense: (input) => reverseExpense(rpc(), input),
  createCompensation: (input) => createCompensationDraft(rpc(), input),
  approveCompensation: (input) => approveCompensation(rpc(), input),
  postCompensation: (input) => postCompensation(rpc(), input),
  reverseCompensation: (input) => reverseCompensation(rpc(), input),
  revalidate: revalidatePath,
  reportError: (operation) => logSafeActionError(operation, null),
};

export async function createExpenseAction(_previous: unknown, data: FormData) {
  return runCreateExpenseAction(data, dependencies);
}
export async function approveExpenseAction(_previous: unknown, data: FormData) {
  return runApproveExpenseAction(data, dependencies);
}
export async function postExpenseAction(_previous: unknown, data: FormData) {
  return runPostExpenseAction(data, dependencies);
}
export async function reverseExpenseAction(_previous: unknown, data: FormData) {
  return runReverseExpenseAction(data, dependencies);
}
export async function createCompensationAction(_previous: unknown, data: FormData) {
  return runCreateCompensationAction(data, dependencies);
}
export async function approveCompensationAction(_previous: unknown, data: FormData) {
  return runApproveCompensationAction(data, dependencies);
}
export async function postCompensationAction(_previous: unknown, data: FormData) {
  return runPostCompensationAction(data, dependencies);
}
export async function reverseCompensationAction(_previous: unknown, data: FormData) {
  return runReverseCompensationAction(data, dependencies);
}

export async function reviewAdminBankEvidenceAction(raw: unknown) {
  try {
    const actor = await requirePlatformOperator();
    if (actor.aal !== 'aal2')
      return { ok: false as const, code: 'FORBIDDEN', error: 'Operation could not be completed' };
    const parsed = z
      .object({
        tenantSlug: z.string().optional(),
        tenantId: z.string().uuid(),
        companyId: z.string().uuid(),
        submissionId: z.string().uuid(),
        operationId: z.string().uuid(),
        expectedVersion: z.number().int().nonnegative(),
        expectedState: z.literal('pending'),
        decision: z.enum(['clean', 'rejected']),
        note: z.string().trim().min(3).max(280).nullable(),
      })
      .strict()
      .parse(raw);
    const result = await reviewBankEvidence({
      actorId: actor.id,
      tenantId: parsed.tenantId,
      companyId: parsed.companyId,
      submissionId: parsed.submissionId,
      operationId: parsed.operationId,
      expectedVersion: parsed.expectedVersion,
      expectedState: parsed.expectedState,
      decision: parsed.decision,
      note: parsed.note,
    });
    if (result.ok) revalidatePath('/admin/finance');
    return result.ok
      ? { ok: true as const, data: { state: result.state, version: result.version } }
      : { ok: false as const, code: result.code, error: 'Operation could not be completed' };
  } catch {
    logSafeActionError('admin.finance.bank_evidence_review', null);
    return {
      ok: false as const,
      code: 'VALIDATION_FAILED',
      error: 'Operation could not be completed',
    };
  }
}

export async function openAdminBankEvidenceAction(raw: unknown) {
  try {
    const actor = await requirePlatformOperator();
    if (actor.aal !== 'aal2')
      return { ok: false as const, code: 'FORBIDDEN', error: 'Operation could not be completed' };
    const parsed = z
      .object({
        tenantSlug: z.string().optional(),
        tenantId: z.string().uuid(),
        companyId: z.string().uuid(),
        submissionId: z.string().uuid(),
        lifetimeSeconds: z.number().int().min(1).max(300),
      })
      .strict()
      .parse(raw);
    return {
      ok: true as const,
      data: await openBankEvidence({
        actorId: actor.id,
        tenantId: parsed.tenantId,
        companyId: parsed.companyId,
        submissionId: parsed.submissionId,
        lifetimeSeconds: parsed.lifetimeSeconds,
      }),
    };
  } catch {
    logSafeActionError('admin.finance.bank_evidence_open', null);
    return { ok: false as const, code: 'UNAVAILABLE', error: 'Operation could not be completed' };
  }
}
