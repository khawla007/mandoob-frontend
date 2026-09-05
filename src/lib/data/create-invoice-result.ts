export function createInvoiceFailure(_cause: unknown) {
  return { ok: false as const, error: 'Could not create invoice', code: 'DB_INSERT_FAILED' };
}
