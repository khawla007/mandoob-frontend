import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
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

const ids = {
  actorId: '11111111-1111-4111-8111-111111111111',
  tenantId: '22222222-2222-4222-8222-222222222222',
  companyId: '33333333-3333-4333-8333-333333333333',
  proProfileId: '44444444-4444-4444-8444-444444444444',
  expenseId: '55555555-5555-4555-8555-555555555555',
  compensationId: '66666666-6666-4666-8666-666666666666',
  operationId: '77777777-7777-4777-8777-777777777777',
};
const adminActionSource = readFileSync(
  join(process.cwd(), 'src/app/admin/finance/actions.ts'),
  'utf8',
);

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) data.set(key, value);
  return data;
}

function context(aal: 'aal1' | 'aal2' = 'aal2') {
  const calls: string[] = [];
  const receipt = {
    expenseId: ids.expenseId,
    version: 1,
    state: 'draft' as const,
    replayed: false,
  };
  const deps: AdminFinanceActionDependencies = {
    async requireActor() {
      calls.push('auth');
      return { id: ids.actorId, role: 'admin', aal };
    },
    async createExpense(input) {
      calls.push(`create-expense:${input.companyId}:${input.amountMinor}:${input.currency}`);
      return { ok: true, data: receipt };
    },
    async approveExpense(input) {
      calls.push(`approve-expense:${input.expenseId}:${input.expectedVersion}`);
      return { ok: true, data: { ...receipt, version: 2, state: 'approved' as const } };
    },
    async postExpense(input) {
      calls.push(`post-expense:${input.expenseId}:${input.settlementAccount}`);
      return {
        ok: true,
        data: { ...receipt, version: 3, state: 'posted' as const, journalId: ids.operationId },
      };
    },
    async reverseExpense(input) {
      calls.push(`reverse-expense:${input.expenseId}:${input.reason}`);
      return {
        ok: true,
        data: { ...receipt, version: 4, state: 'reversed' as const, journalId: ids.operationId },
      };
    },
    async createCompensation(input) {
      calls.push(
        `create-compensation:${input.companyId}:${input.proProfileId}:${input.amountMinor}:${input.currency}`,
      );
      return {
        ok: true,
        data: {
          compensationId: ids.compensationId,
          version: 1,
          state: 'draft' as const,
          replayed: false,
        },
      };
    },
    async approveCompensation(input) {
      calls.push(`approve-compensation:${input.compensationId}:${input.expectedVersion}`);
      return {
        ok: true,
        data: {
          compensationId: ids.compensationId,
          version: 2,
          state: 'approved' as const,
          replayed: false,
        },
      };
    },
    async postCompensation(input) {
      calls.push(`post-compensation:${input.compensationId}:${input.expectedVersion}`);
      return {
        ok: true,
        data: {
          compensationId: ids.compensationId,
          version: 3,
          state: 'posted' as const,
          journalId: ids.operationId,
          replayed: false,
        },
      };
    },
    async reverseCompensation(input) {
      calls.push(`reverse-compensation:${input.compensationId}:${input.reason}`);
      return {
        ok: true,
        data: {
          compensationId: ids.compensationId,
          version: 4,
          state: 'reversed' as const,
          journalId: ids.operationId,
          replayed: false,
        },
      };
    },
    revalidate(path) {
      calls.push(`revalidate:${path}`);
    },
  };
  return { calls, deps };
}

const base = {
  tenantId: ids.tenantId,
  companyId: ids.companyId,
  operationId: ids.operationId,
};

test('expense draft authenticates AAL2, validates exact money fields, and revalidates admin finance', async () => {
  const { calls, deps } = context();
  const result = await runCreateExpenseAction(
    form({
      ...base,
      sourceReference: 'supplier-invoice-1',
      description: 'Government disbursement',
      amountMinor: '10000',
      currency: 'AED',
    }),
    deps,
  );
  assert.equal(result.ok, true);
  assert.deepEqual(calls, [
    'auth',
    `create-expense:${ids.companyId}:10000:AED`,
    'revalidate:/admin/finance',
    `revalidate:/admin/companies/${ids.companyId}`,
  ]);
});

test('compensation draft sends only references and amount for authoritative P3.03 resolution', async () => {
  const { calls, deps } = context();
  const result = await runCreateCompensationAction(
    form({
      ...base,
      proProfileId: ids.proProfileId,
      sourceReference: 'registration-1',
      amountMinor: '10000',
      currency: 'AED',
    }),
    deps,
  );
  assert.equal(result.ok, true);
  assert.deepEqual(calls.slice(0, 2), [
    'auth',
    `create-compensation:${ids.companyId}:${ids.proProfileId}:10000:AED`,
  ]);
});

test('AAL1 is denied before every finance mutation', async () => {
  const cases = [
    () => runCreateExpenseAction(form({ ...base }), context('aal1').deps),
    () =>
      runApproveExpenseAction(form({ ...base, expenseId: ids.expenseId }), context('aal1').deps),
    () => runPostExpenseAction(form({ ...base, expenseId: ids.expenseId }), context('aal1').deps),
    () =>
      runReverseExpenseAction(form({ ...base, expenseId: ids.expenseId }), context('aal1').deps),
    () => runCreateCompensationAction(form({ ...base }), context('aal1').deps),
    () =>
      runApproveCompensationAction(
        form({ ...base, compensationId: ids.compensationId }),
        context('aal1').deps,
      ),
    () =>
      runPostCompensationAction(
        form({ ...base, compensationId: ids.compensationId }),
        context('aal1').deps,
      ),
    () =>
      runReverseCompensationAction(
        form({ ...base, compensationId: ids.compensationId }),
        context('aal1').deps,
      ),
  ];
  for (const invoke of cases) {
    assert.deepEqual(await invoke(), { ok: false, code: 'FORBIDDEN' });
  }
});

test('bank evidence review and open require platform AAL2 before bounded service calls', () => {
  for (const [name, call] of [
    ['reviewAdminBankEvidenceAction', 'reviewBankEvidence'],
    ['openAdminBankEvidenceAction', 'openBankEvidence'],
  ] as const) {
    const start = adminActionSource.indexOf(`export async function ${name}`);
    const next = adminActionSource.indexOf('\nexport async function ', start + 1);
    const body = adminActionSource.slice(start, next < 0 ? undefined : next);
    assert.ok(start >= 0);
    assert.ok(body.indexOf('requirePlatformOperator()') < body.indexOf(`${call}(`));
    assert.match(body, /actor\.aal !== 'aal2'/u);
    assert.match(body, /tenantId: z\.string\(\)\.uuid\(\)/u);
    assert.match(body, /companyId: z\.string\(\)\.uuid\(\)/u);
  }
});

test('stale approvals and database failures stay sanitized and do not revalidate', async () => {
  const { calls, deps } = context();
  deps.approveExpense = async () => {
    calls.push('approve-stale');
    return { ok: false, code: 'STALE_VERSION' };
  };
  const result = await runApproveExpenseAction(
    form({
      ...base,
      expenseId: ids.expenseId,
      expectedVersion: '1',
    }),
    deps,
  );
  assert.deepEqual(result, { ok: false, code: 'STALE_VERSION' });
  assert.deepEqual(calls, ['auth', 'approve-stale']);
});

test('unexpected failures emit one named redacted diagnostic and return unavailable', async () => {
  const { calls, deps } = context();
  deps.createExpense = async () => {
    throw new Error(`password=secret actor=${ids.actorId}`);
  };
  deps.reportError = (operation) => calls.push(`diagnostic:${operation}`);
  const result = await runCreateExpenseAction(
    form({
      ...base,
      sourceReference: 'supplier-invoice-1',
      description: 'Government disbursement',
      amountMinor: '10000',
      currency: 'AED',
    }),
    deps,
  );
  assert.deepEqual(result, { ok: false, code: 'UNAVAILABLE' });
  assert.deepEqual(calls, ['auth', 'diagnostic:admin.finance.create_expense']);
  assert.doesNotMatch(calls.join(' '), /password|secret|11111111/u);
});

test('all lifecycle forms reject invalid or excess input before mutation', async () => {
  const { calls, deps } = context();
  const result = await runPostExpenseAction(
    form({
      ...base,
      expenseId: ids.expenseId,
      expectedVersion: '2',
      settlementAccount: 'receivable',
      unexpected: 'private',
    }),
    deps,
  );
  assert.deepEqual(result, { ok: false, code: 'VALIDATION_FAILED' });
  assert.deepEqual(calls, ['auth']);
});

test('server action boundary exports each Admin finance command and uses fresh platform authorization', () => {
  const source = readFileSync(join(process.cwd(), 'src/app/admin/finance/actions.ts'), 'utf8');
  for (const name of [
    'createExpenseAction',
    'approveExpenseAction',
    'postExpenseAction',
    'reverseExpenseAction',
    'createCompensationAction',
    'approveCompensationAction',
    'postCompensationAction',
    'reverseCompensationAction',
  ]) {
    assert.match(source, new RegExp(`export async function ${name}\\(`, 'u'));
  }
  assert.match(source, /requirePlatformOperator\(\)/u);
  assert.doesNotMatch(
    source,
    /from\(['"]pro_commercial_terms['"]\)|from\(['"]pro_company_assignments['"]\)/u,
  );
});
