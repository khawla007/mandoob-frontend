import { payloadHash } from '@/lib/p308/operation';
import { callP308, type P308Actor, type P308RpcClient } from '@/lib/p308/rpc';
import type {
  CreateEmployeeInput,
  EmployeeSelfUpdateInput,
  SetEmployeeStatusInput,
  UpdateEmployeeInput,
} from '@/lib/validation/employee';
import { sealEmployeeIdentifiers, type SealDeps } from './identifiers';

export type EmployeeCryptoDeps = SealDeps & {
  /** Keyed blind value so operation hashes never contain guessable PII digests. */
  blind: (domain: string, value: string) => string;
};

export type EmployeeReceipt = { employee_id: string; version: number; replayed: boolean };

type PlainFields = Partial<Omit<CreateEmployeeInput, 'operation_id'>>;

function blindHashInput(companyId: string, fields: PlainFields, crypto: EmployeeCryptoDeps) {
  const blinded: Record<string, unknown> = { ...fields };
  for (const key of ['passport_no', 'visa_no', 'emirates_id'] as const) {
    const value = fields[key];
    if (value) blinded[key] = crypto.blind(`p308:${key}:${companyId}`, value.trim().toUpperCase());
  }
  return blinded;
}

function toDatabasePayload(companyId: string, fields: PlainFields, crypto: EmployeeCryptoDeps) {
  const { passport_no, visa_no, emirates_id, ...rest } = fields;
  const payload: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(rest)) {
    if (value !== undefined) payload[key] = value === '' ? null : value;
  }
  return {
    ...payload,
    ...sealEmployeeIdentifiers(
      companyId,
      {
        ...(passport_no !== undefined ? { passport_no } : {}),
        ...(visa_no !== undefined ? { visa_no } : {}),
        ...(emirates_id !== undefined ? { emirates_id } : {}),
      },
      crypto,
    ),
  };
}

export async function createEmployee(
  client: P308RpcClient,
  actor: P308Actor,
  input: CreateEmployeeInput,
  crypto: EmployeeCryptoDeps,
): Promise<EmployeeReceipt> {
  const { operation_id, ...fields } = input;
  return callP308(client, 'p308_create_employee', {
    p_actor_id: actor.actorId,
    p_operation_id: operation_id,
    p_payload_hash: payloadHash(blindHashInput(actor.companyId, fields, crypto)),
    p_tenant_id: actor.tenantId,
    p_company_id: actor.companyId,
    p_employee: toDatabasePayload(actor.companyId, fields, crypto),
  });
}

export async function updateEmployee(
  client: P308RpcClient,
  actor: P308Actor,
  input: UpdateEmployeeInput,
  crypto: EmployeeCryptoDeps,
): Promise<EmployeeReceipt> {
  return callP308(client, 'p308_update_employee', {
    p_actor_id: actor.actorId,
    p_operation_id: input.operation_id,
    p_payload_hash: payloadHash({
      employee_id: input.employee_id,
      expected_version: input.expected_version,
      patch: blindHashInput(actor.companyId, input.patch, crypto),
    }),
    p_tenant_id: actor.tenantId,
    p_company_id: actor.companyId,
    p_employee_id: input.employee_id,
    p_expected_version: input.expected_version,
    p_patch: toDatabasePayload(actor.companyId, input.patch, crypto),
  });
}

export async function setEmployeeStatus(
  client: P308RpcClient,
  actor: P308Actor,
  input: SetEmployeeStatusInput,
): Promise<EmployeeReceipt> {
  const { operation_id, ...rest } = input;
  return callP308(client, 'p308_set_employee_status', {
    p_actor_id: actor.actorId,
    p_operation_id: operation_id,
    p_payload_hash: payloadHash(rest),
    p_tenant_id: actor.tenantId,
    p_company_id: actor.companyId,
    p_employee_id: input.employee_id,
    p_expected_version: input.expected_version,
    p_status: input.status,
  });
}

/** Employee self-service: the employee record is resolved from the actor in SQL. */
export async function updateEmployeeSelf(
  client: P308RpcClient,
  actor: { actorId: string; tenantId: string },
  input: EmployeeSelfUpdateInput,
): Promise<EmployeeReceipt> {
  const { operation_id, expected_version, ...patch } = input;
  const clean = Object.fromEntries(
    Object.entries(patch).filter(([, value]) => value !== undefined),
  );
  return callP308(client, 'p308_update_employee_self', {
    p_actor_id: actor.actorId,
    p_operation_id: operation_id,
    p_payload_hash: payloadHash({ expected_version, ...clean }),
    p_tenant_id: actor.tenantId,
    p_expected_version: expected_version,
    p_patch: clean,
  });
}
