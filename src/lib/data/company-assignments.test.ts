import assert from 'node:assert/strict';
import test from 'node:test';

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';
process.env.ENCRYPTION_KEY = Buffer.alloc(32, 1).toString('base64');

type Result = { data: unknown; error: { message?: string; code?: string } | null };

function fakeSupabase(results: Result[]) {
  const calls: Array<{ kind: string; name: string; value?: unknown }> = [];
  let resultIndex = 0;

  function builder() {
    const chain = {
      select(value: string) {
        calls.push({ kind: 'select', name: value });
        return chain;
      },
      eq(name: string, value: unknown) {
        calls.push({ kind: 'eq', name, value });
        return chain;
      },
      is(name: string, value: unknown) {
        calls.push({ kind: 'is', name, value });
        return chain;
      },
      order(name: string, value: unknown) {
        calls.push({ kind: 'order', name, value });
        return chain;
      },
      limit(value: number) {
        calls.push({ kind: 'limit', name: 'limit', value });
        return chain;
      },
      or(value: string) {
        calls.push({ kind: 'or', name: 'or', value });
        return chain;
      },
      range(from: number, to: number) {
        calls.push({ kind: 'range', name: 'range', value: { from, to } });
        return chain;
      },
      async maybeSingle() {
        return results[resultIndex++];
      },
      then(resolve: (value: Result) => void) {
        resolve(results[resultIndex++]);
      },
    };
    return chain;
  }

  return {
    calls,
    rpc(name: string, value: unknown) {
      calls.push({ kind: 'rpc', name, value });
      return Promise.resolve(results[resultIndex++]);
    },
    from(name: string) {
      calls.push({ kind: 'from', name });
      return builder();
    },
  };
}

const companyId = '11111111-1111-4111-8111-111111111111';
const proId = '22222222-2222-4222-8222-222222222222';
const assignmentId = '33333333-3333-4333-8333-333333333333';
const actorId = '44444444-4444-4444-8444-444444444444';

test('assignment mutations validate input and call exact lifecycle RPC arguments', async () => {
  const { assignProToCompany, releaseCompanyPro, reassignCompanyPro } =
    await import('./company-assignments');
  const replacementId = '55555555-5555-4555-8555-555555555555';
  const supabase = fakeSupabase([
    { data: assignmentId, error: null },
    { data: assignmentId, error: null },
    { data: replacementId, error: null },
  ]);

  assert.equal(
    await assignProToCompany({ companyId, proProfileId: proId }, actorId, {
      supabase: supabase as never,
    }),
    assignmentId,
  );
  await releaseCompanyPro({ companyId, assignmentId, reason: '  Engagement ended  ' }, actorId, {
    supabase: supabase as never,
  });
  assert.equal(
    await reassignCompanyPro(
      {
        companyId,
        assignmentId,
        replacementProProfileId: replacementId,
        reason: '  Coverage change  ',
      },
      actorId,
      { supabase: supabase as never },
    ),
    replacementId,
  );

  assert.deepEqual(
    supabase.calls.filter((call) => call.kind === 'rpc'),
    [
      {
        kind: 'rpc',
        name: 'assign_pro_to_company',
        value: {
          p_company_id: companyId,
          p_pro_profile_id: proId,
          p_actor_profile_id: actorId,
        },
      },
      {
        kind: 'rpc',
        name: 'release_company_pro',
        value: {
          p_company_id: companyId,
          p_expected_assignment_id: assignmentId,
          p_reason: 'Engagement ended',
          p_actor_profile_id: actorId,
        },
      },
      {
        kind: 'rpc',
        name: 'reassign_company_pro',
        value: {
          p_company_id: companyId,
          p_expected_assignment_id: assignmentId,
          p_replacement_pro_profile_id: replacementId,
          p_reason: 'Coverage change',
          p_actor_profile_id: actorId,
        },
      },
    ],
  );
});

test('assignment mutations reject invalid input before RPC execution', async () => {
  const { assignProToCompany } = await import('./company-assignments');
  const supabase = fakeSupabase([]);

  await assert.rejects(
    () =>
      assignProToCompany({ companyId: 'not-a-uuid', proProfileId: proId }, actorId, {
        supabase: supabase as never,
      }),
    /uuid/i,
  );
  assert.equal(supabase.calls.length, 0);
});

test('assignment mutations reject a malformed server-derived actor before RPC execution', async () => {
  const { assignProToCompany } = await import('./company-assignments');
  const supabase = fakeSupabase([]);

  await assert.rejects(
    () =>
      assignProToCompany({ companyId, proProfileId: proId }, 'not-an-actor-uuid', {
        supabase: supabase as never,
      }),
    /uuid/i,
  );
  assert.equal(supabase.calls.length, 0);
});

test('mutation failures expose mapped codes but never raw database messages', async () => {
  const { assignProToCompany } = await import('./company-assignments');
  const conflict = fakeSupabase([
    { data: null, error: { message: 'PRO_ALREADY_ASSIGNED', code: 'P0001' } },
  ]);
  await assert.rejects(
    () =>
      assignProToCompany({ companyId, proProfileId: proId }, actorId, {
        supabase: conflict as never,
      }),
    (error: unknown) =>
      error instanceof Error &&
      'code' in error &&
      error.code === 'PRO_ALREADY_ASSIGNED' &&
      !error.message.includes('PRO_ALREADY_ASSIGNED'),
  );

  const unknown = fakeSupabase([
    { data: null, error: { message: 'password leaked from postgres', code: 'XX000' } },
  ]);
  await assert.rejects(
    () =>
      assignProToCompany({ companyId, proProfileId: proId }, actorId, {
        supabase: unknown as never,
      }),
    (error: unknown) =>
      error instanceof Error &&
      'code' in error &&
      error.code === 'INTERNAL' &&
      !error.message.includes('password'),
  );
});

test('malformed RPC return IDs are sanitized as internal failures', async () => {
  const { assignProToCompany } = await import('./company-assignments');
  const supabase = fakeSupabase([{ data: 'not-a-uuid', error: null }]);

  await assert.rejects(
    () =>
      assignProToCompany({ companyId, proProfileId: proId }, actorId, {
        supabase: supabase as never,
      }),
    (error: unknown) =>
      error instanceof Error &&
      'code' in error &&
      error.code === 'INTERNAL' &&
      !error.message.includes('not-a-uuid'),
  );
});

const assignmentRow = {
  id: assignmentId,
  tenant_id: '66666666-6666-4666-8666-666666666666',
  company_id: companyId,
  pro_profile_id: proId,
  status: 'active',
  assigned_at: '2026-08-17T10:00:00.000Z',
  assigned_by: actorId,
  released_at: null,
  released_by: null,
  release_reason: null,
  profiles: { full_name: 'Aisha PRO' },
};

function historyId(value: number): string {
  return `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
}

function concurrentHistorySupabase() {
  const calls: Array<{ kind: string; name: string; value?: unknown }> = [];
  const assignedAt = '2026-08-17T10:00:00.000Z';
  const initialRows = Array.from({ length: 501 }, (_, index) => ({
    ...assignmentRow,
    id: historyId(501 - index),
    assigned_at: assignedAt,
  }));
  const insertedAtFront = { ...assignmentRow, id: historyId(502), assigned_at: assignedAt };
  const cursorId = historyId(2);
  const expectedCursor = `assigned_at.lt.${assignedAt},and(assigned_at.eq.${assignedAt},id.lt.${cursorId})`;
  let request = 0;

  return {
    calls,
    expectedCursor,
    from(name: string) {
      calls.push({ kind: 'from', name });
      let cursorFilter: string | null = null;
      let pageSize = 1000;
      let offset = 0;
      const chain = {
        select(value: string) {
          calls.push({ kind: 'select', name: value });
          return chain;
        },
        eq(name: string, value: unknown) {
          calls.push({ kind: 'eq', name, value });
          return chain;
        },
        or(value: string) {
          cursorFilter = value;
          calls.push({ kind: 'or', name: 'or', value });
          return chain;
        },
        order(name: string, value: unknown) {
          calls.push({ kind: 'order', name, value });
          return chain;
        },
        limit(value: number) {
          pageSize = value;
          calls.push({ kind: 'limit', name: 'limit', value });
          return chain;
        },
        range(from: number, to: number) {
          offset = from;
          pageSize = to - from + 1;
          calls.push({ kind: 'range', name: 'range', value: { from, to } });
          return chain;
        },
        then(resolve: (value: Result) => void) {
          request += 1;
          const rows = request === 1 ? initialRows : [insertedAtFront, ...initialRows];
          const eligible = cursorFilter
            ? rows.filter(
                (row) =>
                  row.assigned_at < assignedAt ||
                  (row.assigned_at === assignedAt && row.id < cursorId),
              )
            : rows.slice(offset);
          resolve({ data: eligible.slice(0, pageSize), error: null });
        },
      };
      return chain;
    },
  };
}

test('current assignment is company-scoped and filters active status', async () => {
  const { readCurrentCompanyAssignment } = await import('./company-assignments');
  const supabase = fakeSupabase([{ data: assignmentRow, error: null }]);

  const row = await readCurrentCompanyAssignment(companyId, { supabase: supabase as never });

  assert.equal(row?.proFullName, 'Aisha PRO');
  assert.deepEqual(supabase.calls[0], { kind: 'from', name: 'pro_company_assignments' });
  assert.equal(
    supabase.calls.find((call) => call.kind === 'select')?.name,
    'id, tenant_id, company_id, pro_profile_id, status, assigned_at, assigned_by, released_at, released_by, release_reason, profiles!pro_company_assignments_pro_profile_id_fkey(full_name)',
  );
  assert.deepEqual(
    supabase.calls.filter((call) => call.kind === 'eq'),
    [
      { kind: 'eq', name: 'company_id', value: companyId },
      { kind: 'eq', name: 'status', value: 'active' },
    ],
  );
});

test('history keyset pagination survives a concurrent front insertion and equal-time tie', async () => {
  const { listCompanyAssignmentHistory } = await import('./company-assignments');
  const supabase = concurrentHistorySupabase();

  const rows = await listCompanyAssignmentHistory(companyId, { supabase: supabase as never });

  assert.equal(rows.length, 501);
  assert.deepEqual(
    rows.map((row) => row.id),
    Array.from({ length: 501 }, (_, index) => historyId(501 - index)),
  );
  assert.deepEqual(supabase.calls, [
    { kind: 'from', name: 'pro_company_assignments' },
    {
      kind: 'select',
      name: 'id, tenant_id, company_id, pro_profile_id, status, assigned_at, assigned_by, released_at, released_by, release_reason, profiles!pro_company_assignments_pro_profile_id_fkey(full_name)',
    },
    { kind: 'eq', name: 'company_id', value: companyId },
    { kind: 'order', name: 'assigned_at', value: { ascending: false } },
    { kind: 'order', name: 'id', value: { ascending: false } },
    { kind: 'limit', name: 'limit', value: 500 },
    { kind: 'from', name: 'pro_company_assignments' },
    {
      kind: 'select',
      name: 'id, tenant_id, company_id, pro_profile_id, status, assigned_at, assigned_by, released_at, released_by, release_reason, profiles!pro_company_assignments_pro_profile_id_fkey(full_name)',
    },
    { kind: 'eq', name: 'company_id', value: companyId },
    { kind: 'or', name: 'or', value: supabase.expectedCursor },
    { kind: 'order', name: 'assigned_at', value: { ascending: false } },
    { kind: 'order', name: 'id', value: { ascending: false } },
    { kind: 'limit', name: 'limit', value: 500 },
  ]);
});

test('history stops after an empty first page', async () => {
  const { listCompanyAssignmentHistory } = await import('./company-assignments');
  const supabase = fakeSupabase([{ data: [], error: null }]);

  assert.deepEqual(
    await listCompanyAssignmentHistory(companyId, { supabase: supabase as never }),
    [],
  );
  assert.deepEqual(
    supabase.calls.filter((call) => call.kind === 'limit'),
    [{ kind: 'limit', name: 'limit', value: 500 }],
  );
  assert.equal(
    supabase.calls.some((call) => call.kind === 'or'),
    false,
  );
});

test('history fails closed when a later page errors', async () => {
  const { listCompanyAssignmentHistory } = await import('./company-assignments');
  const firstPage = Array.from({ length: 500 }, (_, index) => ({
    ...assignmentRow,
    id: historyId(500 - index),
  }));
  const supabase = fakeSupabase([
    { data: firstPage, error: null },
    { data: null, error: { message: 'secret later-page details', code: 'XX000' } },
  ]);

  await assert.rejects(
    () => listCompanyAssignmentHistory(companyId, { supabase: supabase as never }),
    (error: unknown) =>
      error instanceof Error &&
      'code' in error &&
      error.code === 'INTERNAL' &&
      !error.message.includes('secret'),
  );
  assert.deepEqual(
    supabase.calls.filter((call) => call.kind === 'or'),
    [
      {
        kind: 'or',
        name: 'or',
        value: `assigned_at.lt.${assignmentRow.assigned_at},and(assigned_at.eq.${assignmentRow.assigned_at},id.lt.${historyId(1)})`,
      },
    ],
  );
});

test('history rejects a malformed database cursor before requesting another page', async () => {
  const { listCompanyAssignmentHistory } = await import('./company-assignments');
  const firstPage = Array.from({ length: 500 }, (_, index) => ({
    ...assignmentRow,
    id: historyId(500 - index),
  }));
  firstPage[499] = { ...firstPage[499], id: 'malformed-cursor', assigned_at: 'not-a-timestamp' };
  const supabase = fakeSupabase([{ data: firstPage, error: null }]);

  await assert.rejects(
    () => listCompanyAssignmentHistory(companyId, { supabase: supabase as never }),
    (error: unknown) =>
      error instanceof Error &&
      'code' in error &&
      error.code === 'INTERNAL' &&
      !error.message.includes('cursor'),
  );
  assert.equal(supabase.calls.filter((call) => call.kind === 'from').length, 1);
});

test('assignment reads validate company IDs before service-role queries', async () => {
  const { readCurrentCompanyAssignment, listCompanyAssignmentHistory } =
    await import('./company-assignments');
  const supabase = fakeSupabase([]);

  await assert.rejects(
    () => readCurrentCompanyAssignment('bad-company', { supabase: supabase as never }),
    (error: unknown) => error instanceof Error && 'code' in error && error.code === 'INTERNAL',
  );
  await assert.rejects(
    () => listCompanyAssignmentHistory('bad-company', { supabase: supabase as never }),
    (error: unknown) => error instanceof Error && 'code' in error && error.code === 'INTERNAL',
  );
  assert.equal(supabase.calls.length, 0);
});

test('assignment read database errors are sanitized', async () => {
  const { readCurrentCompanyAssignment, listCompanyAssignmentHistory, listVerifiedUnassignedPros } =
    await import('./company-assignments');
  for (const read of [readCurrentCompanyAssignment, listCompanyAssignmentHistory]) {
    const supabase = fakeSupabase([
      { data: null, error: { message: 'secret database details', code: 'XX000' } },
    ]);
    await assert.rejects(
      () => read(companyId, { supabase: supabase as never }),
      (error: unknown) =>
        error instanceof Error &&
        'code' in error &&
        error.code === 'INTERNAL' &&
        !error.message.includes('secret'),
    );
  }

  const supabase = fakeSupabase([
    { data: null, error: { message: 'secret database details', code: 'XX000' } },
  ]);
  await assert.rejects(
    () => listVerifiedUnassignedPros({ supabase: supabase as never }),
    (error: unknown) =>
      error instanceof Error &&
      'code' in error &&
      error.code === 'INTERNAL' &&
      !error.message.includes('secret'),
  );
});

test('assignable PRO query is verified, active, role-scoped and excludes active assignments', async () => {
  const { listVerifiedUnassignedPros } = await import('./company-assignments');
  const supabase = fakeSupabase([
    {
      data: [
        {
          id: proId,
          full_name: 'Aisha PRO',
          role: 'pro',
          status: 'active',
          pro_profiles: {
            designation: 'Public Relations Officer',
            department: 'Government Relations',
            verified_at: '2026-08-01T00:00:00.000Z',
            credentials_verified: true,
          },
          active_assignments: [],
        },
      ],
      error: null,
    },
  ]);

  const rows = await listVerifiedUnassignedPros({ supabase: supabase as never });

  assert.deepEqual(rows, [
    {
      id: proId,
      fullName: 'Aisha PRO',
      designation: 'Public Relations Officer',
      department: 'Government Relations',
      verifiedAt: '2026-08-01T00:00:00.000Z',
    },
  ]);
  assert.deepEqual(supabase.calls[0], { kind: 'from', name: 'profiles' });
  assert.equal(
    supabase.calls.find((call) => call.kind === 'select')?.name,
    'id, full_name, pro_profiles!inner(designation, department, verified_at, credentials_verified), active_assignments:pro_company_assignments!pro_company_assignments_pro_profile_id_fkey()',
  );
  for (const [name, value] of [
    ['role', 'pro'],
    ['status', 'active'],
    ['pro_profiles.credentials_verified', true],
    ['active_assignments.status', 'active'],
  ] as const) {
    assert.ok(
      supabase.calls.some(
        (call) => call.kind === 'eq' && call.name === name && call.value === value,
      ),
      `missing ${name} filter`,
    );
  }
  assert.deepEqual(
    supabase.calls.find((call) => call.kind === 'is'),
    {
      kind: 'is',
      name: 'active_assignments',
      value: null,
    },
  );
  assert.deepEqual(
    supabase.calls.filter((call) => call.kind === 'order'),
    [
      { kind: 'order', name: 'full_name', value: { ascending: true } },
      { kind: 'order', name: 'id', value: { ascending: true } },
    ],
  );
  assert.deepEqual(
    supabase.calls.find((call) => call.kind === 'limit'),
    {
      kind: 'limit',
      name: 'limit',
      value: 500,
    },
  );
});
