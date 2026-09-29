import { mapP308Error, type P308ErrorCode } from './operation';

export class P308Error extends Error {
  readonly code: P308ErrorCode;
  readonly status: number;

  constructor(code: P308ErrorCode, status: number) {
    super(code);
    this.name = 'P308Error';
    this.code = code;
    this.status = status;
  }
}

export type P308RpcClient = {
  rpc(fn: string, params: Record<string, unknown>): PromiseLike<{ data: unknown; error: unknown }>;
};

/** Calls one service-role P3.08 RPC; database text never escapes this boundary. */
export async function callP308<T>(
  client: P308RpcClient,
  fn: string,
  params: Record<string, unknown>,
): Promise<T> {
  const { data, error } = await client.rpc(fn, params);
  if (error) {
    const failure = mapP308Error(error);
    throw new P308Error(failure.code, failure.status);
  }
  return data as T;
}

export type P308Actor = { actorId: string; tenantId: string; companyId: string };
