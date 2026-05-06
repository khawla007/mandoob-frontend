import 'server-only';
import { formatMoney } from '@/lib/format/money';
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role';

export type PendingInvoice = {
  id: string;
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
};

export type PaymentHistory = {
  pending: PendingInvoice[];
  history: PaidInvoice[];
};

type InvoiceRow = {
  id: string;
  label: string;
  amount_minor: number;
  currency: string;
  status: string;
  due_at: string | null;
  paid_at: string | null;
  created_at: string;
};

export async function getInvoicesForCustomer(profileId: string): Promise<PaymentHistory> {
  const admin = createSupabaseServiceRoleClient();
  const { data } = await admin
    .from('invoices')
    .select('id, label, amount_minor, currency, status, due_at, paid_at, created_at')
    .eq('customer_profile_id', profileId)
    .order('created_at', { ascending: false })
    .limit(100);

  const rows = (data ?? []) as InvoiceRow[];
  const pending: PendingInvoice[] = [];
  const history: PaidInvoice[] = [];

  for (const row of rows) {
    const amountFormatted = formatMoney(row.amount_minor, row.currency);
    if (row.status === 'open') {
      pending.push({
        id: row.id,
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
      });
    }
  }

  return { pending, history };
}
