import 'server-only';
import { formatMoney } from '@/lib/format/money';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export type PendingInvoice = {
  id: string;
  version: number;
  label: string;
  amount: string;
  amountMinor: number;
  currency: string;
  dueDate: string | null;
};

export type PaidInvoice = {
  id: string;
  label: string;
  amount: string;
  paidAt: string;
  status: 'paid' | 'refunded' | 'partially_refunded';
  receiptAvailable: boolean;
};

export type PaymentHistory = {
  pending: PendingInvoice[];
  history: PaidInvoice[];
};

type InvoiceRow = {
  id: string;
  version: number;
  label: string;
  amount_minor: number;
  currency: string;
  status: string;
  due_at: string | null;
  paid_at: string | null;
  created_at: string;
  receipt_available: boolean;
};

export async function getInvoicesForCustomer(profileId: string): Promise<PaymentHistory> {
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin.rpc(
    'p309_list_customer_payment_history' as never,
    { p_customer_profile_id: profileId } as never,
  );
  if (error || !Array.isArray(data) || !data.every(isInvoiceRow))
    return { pending: [], history: [] };
  const rows = data as InvoiceRow[];
  const pending: PendingInvoice[] = [];
  const history: PaidInvoice[] = [];

  for (const row of rows) {
    const amountFormatted = formatMoney(row.amount_minor, row.currency);
    if (row.status === 'open') {
      pending.push({
        id: row.id,
        version: row.version,
        label: row.label,
        amount: amountFormatted,
        amountMinor: row.amount_minor,
        currency: row.currency,
        dueDate: row.due_at,
      });
    } else if (
      row.status === 'paid' ||
      row.status === 'refunded' ||
      row.status === 'partially_refunded'
    ) {
      history.push({
        id: row.id,
        label: row.label,
        amount: amountFormatted,
        paidAt: row.paid_at ?? row.created_at,
        status: row.status as 'paid' | 'refunded' | 'partially_refunded',
        receiptAvailable: row.receipt_available,
      });
    }
  }

  return { pending, history };
}

function isInvoiceRow(value: unknown): value is InvoiceRow {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    typeof row.id === 'string' &&
    Number.isSafeInteger(row.version) &&
    typeof row.label === 'string' &&
    Number.isSafeInteger(row.amount_minor) &&
    (row.amount_minor as number) >= 0 &&
    typeof row.currency === 'string' &&
    /^[A-Z]{3}$/u.test(row.currency) &&
    typeof row.status === 'string' &&
    typeof row.created_at === 'string' &&
    typeof row.receipt_available === 'boolean'
  );
}
