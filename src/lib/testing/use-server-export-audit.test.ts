import assert from 'node:assert/strict';
import test from 'node:test';

import { auditUseServerRuntimeExports } from './use-server-export-audit';

test('accepts type-only exports and async server actions', () => {
  assert.deepEqual(
    auditUseServerRuntimeExports(`
      'use server';
      export type State = { ok: boolean };
      export interface Input { id: string }
      export type { ExternalState } from './state';
      export { type ExternalInput } from './input';
      export async function submit(): Promise<void> {}
      export const update = async (): Promise<void> => {};
      const base = async (): Promise<void> => {};
      export const aliased = base;
      async function listed(): Promise<void> {}
      export { listed };
      export function promised(): Promise<void> { return Promise.resolve(); }
    `),
    [],
  );
  assert.deepEqual(
    auditUseServerRuntimeExports(`'use server'; export default async function submit() {}`),
    [],
  );
  assert.deepEqual(
    auditUseServerRuntimeExports(`'use server'; export default async () => {};`),
    [],
  );
  assert.deepEqual(
    auditUseServerRuntimeExports(`
      'use server';
      async function submit() {}
      export default submit;
    `),
    [],
  );
  assert.deepEqual(
    auditUseServerRuntimeExports(`'use server'; export default (async () => {});`),
    [],
  );
});

test('rejects every non-callable or non-async runtime export form', () => {
  const invalid = [
    ['export default function submit() {}', 'default non-async function'],
    ['export default () => {};', 'default non-async function'],
    ['export default {};', 'default exported value'],
    ['export default class ActionState {}', 'default exported class'],
    ['function submit() {}; export default submit;', 'default non-async function'],
    ['const state = {}; export default state;', 'default exported value'],
    ['class ActionState {}; export default ActionState;', 'default exported value'],
    ['const state = {}; export { state };', 'runtime export list'],
    ["export { state } from './state';", 'runtime re-export'],
    ["export * from './actions';", 'runtime re-export'],
    ['export enum Status { Idle }', 'enum'],
    ["export const initialState = { status: 'idle' };", 'initialState'],
    ['export class ActionState {}', 'class'],
    ['export function submit() {}', 'non-async function'],
    ['export const submit = () => {};', 'non-async function'],
    ['export async function* submit() {}', 'does not return Promise'],
  ] as const;

  for (const [runtimeExport, expected] of invalid) {
    const violations = auditUseServerRuntimeExports(`'use server';\n${runtimeExport}`);
    assert.ok(
      violations.some((violation) => violation.includes(expected)),
      runtimeExport,
    );
  }
});

test('ignores modules without a use-server directive', () => {
  assert.deepEqual(auditUseServerRuntimeExports('export const initialState = {};'), []);
  assert.deepEqual(
    auditUseServerRuntimeExports(`
      const initialState = {};
      'use server';
      export const invalidAtRuntime = initialState;
    `),
    [],
  );
});
