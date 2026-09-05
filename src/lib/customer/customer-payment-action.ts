import { normaliseCustomerInvoice, type CustomerInvoiceDbRow } from './customer-finance';

export type CustomerPaymentScope = {
  tenantId: string;
  companyId: string;
  profileId: string;
  invoiceId: string;
};

export function validateCustomerInvoiceForPayment(
  row: Partial<CustomerInvoiceDbRow> | null,
  scope: CustomerPaymentScope,
  sourceError: unknown = null,
):
  | { ok: true }
  | { ok: false; error: string; code: 'NOT_FOUND' | 'INVALID_STATE' | 'PAYMENT_STATE_ERROR' } {
  if (sourceError)
    return { ok: false, error: 'Payment status is unavailable', code: 'PAYMENT_STATE_ERROR' };
  if (
    !row ||
    row.id !== scope.invoiceId ||
    row.tenant_id !== scope.tenantId ||
    row.company_id !== scope.companyId ||
    row.customer_profile_id !== scope.profileId
  )
    return { ok: false, error: 'Invoice not found', code: 'NOT_FOUND' };
  const invoice = normaliseCustomerInvoice(row);
  if (!invoice || invoice.status !== 'open')
    return { ok: false, error: 'This invoice is not payable', code: 'INVALID_STATE' };
  return { ok: true };
}
