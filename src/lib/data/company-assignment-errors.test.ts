import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';

import { mapCompanyAssignmentError } from './company-assignment-errors';

const DOMAIN_CODES = [
  'PRO_ALREADY_ASSIGNED',
  'COMPANY_ALREADY_ASSIGNED',
  'PRO_NOT_VERIFIED',
  'PRO_INACTIVE',
  'PRO_PRICING_NOT_CONFIGURED',
  'PRO_COMPENSATION_NOT_CONFIGURED',
  'COMPANY_NOT_READY',
  'COMPANY_INACTIVE',
  'ASSIGNMENT_NOT_FOUND',
  'STALE_ASSIGNMENT',
  'ASSIGNMENT_CONFLICT',
] as const;

test('maps each exact approved domain message to a conflict', () => {
  for (const code of DOMAIN_CODES) {
    assert.deepEqual(mapCompanyAssignmentError({ message: code }), {
      code,
      status: 409,
    });
  }
});

test('trims approved domain messages before mapping', () => {
  assert.deepEqual(mapCompanyAssignmentError({ message: '  PRO_INACTIVE  ' }), {
    code: 'PRO_INACTIVE',
    status: 409,
  });
});

test('maps PostgreSQL unique violations to the stable conflict code', () => {
  assert.deepEqual(
    mapCompanyAssignmentError({
      code: '23505',
      message: 'duplicate key value reveals private constraint details',
    }),
    { code: 'ASSIGNMENT_CONFLICT', status: 409 },
  );
});

test('redacts unknown, missing, null, and near-match database output', () => {
  for (const error of [
    null,
    {},
    { message: null },
    { message: 42 },
    { message: 'relation private_table does not exist' },
    { message: 'PRO_ALREADY_ASSIGNED: private details' },
    { message: 'pro_already_assigned' },
    { code: '22000', message: 'PRO ALREADY ASSIGNED' },
  ]) {
    assert.deepEqual(mapCompanyAssignmentError(error), {
      code: 'INTERNAL',
      status: 500,
    });
  }
});

test('maps every assignment RPC P0001 domain message without allowlist drift', () => {
  const migration = readFileSync(
    join(process.cwd(), 'supabase/migrations/20260817091000_0060_company_assignment_rpcs_rls.sql'),
    'utf8',
  );
  const emittedCodes = new Set(
    [...migration.matchAll(/errcode\s*=\s*'P0001'\s*,\s*message\s*=\s*'([A-Z_]+)'/g)].map(
      (match) => match[1],
    ),
  );

  assert.ok(emittedCodes.size > 0, 'expected assignment RPC domain messages');
  for (const code of emittedCodes) {
    assert.deepEqual(mapCompanyAssignmentError({ code: 'P0001', message: code }), {
      code,
      status: 409,
    });
  }
});

test('keeps internal RPC validation and authorization messages sanitized', () => {
  assert.deepEqual(mapCompanyAssignmentError({ code: '42501', message: 'FORBIDDEN' }), {
    code: 'INTERNAL',
    status: 500,
  });
  assert.deepEqual(
    mapCompanyAssignmentError({ code: '22023', message: 'INVALID_RELEASE_REASON' }),
    { code: 'INTERNAL', status: 500 },
  );
});
