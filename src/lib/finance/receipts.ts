import { formatMoney } from '@/lib/format/money';
import type { ReceiptPdfInput } from '@/lib/pdf/receipt';

export type ReceiptKind = 'invoice' | 'payment' | 'refund';
export type ReceiptSelection = { kind: ReceiptKind; id: string };
export type ReceiptSnapshot = {
  receiptKind: ReceiptKind;
  receiptId: string;
  invoiceId: string;
  tenantName: string;
  tenantColor: string | null;
  companyName: string;
  customerName: string | null;
  label: string;
  currency: string;
  subtotalMinor: number;
  discountMinor: number;
  vatMinor: number;
  totalMinor: number;
  paidMinor: number;
  refundedMinor: number;
  status: string;
  occurredAt: string;
  paymentMethod: string | null;
  lines: Array<{ description: string; netMinor: number; vatMinor: number; totalMinor: number }>;
  refunds: Array<{ id: string; amountMinor: number; status: string; reason: string | null }>;
};

const RECEIPT_KINDS = new Set<ReceiptKind>(['invoice', 'payment', 'refund']);
const MONEY_KEYS = [
  'subtotalMinor',
  'discountMinor',
  'vatMinor',
  'totalMinor',
  'paidMinor',
  'refundedMinor',
] as const;

export function parseReceiptSelection(url: URL, invoiceId: string): ReceiptSelection | null {
  const kinds = url.searchParams.getAll('kind');
  const ids = url.searchParams.getAll('receiptId');
  if (kinds.length === 0 && ids.length === 0) return { kind: 'invoice', id: invoiceId };
  if (kinds.length !== 1 || ids.length !== 1) return null;
  const kind = kinds[0] as ReceiptKind;
  const id = ids[0].trim();
  return RECEIPT_KINDS.has(kind) && id.length > 0 && id.length <= 200 ? { kind, id } : null;
}

export function sanitizeReceiptSnapshot(value: unknown): ReceiptSnapshot | null {
  if (!value || typeof value !== 'object') return null;
  const row = value as Record<string, unknown>;
  if (
    !RECEIPT_KINDS.has(row.receiptKind as ReceiptKind) ||
    !isText(row.receiptId, 200) ||
    !isText(row.invoiceId, 200) ||
    !isText(row.tenantName, 300) ||
    !isText(row.companyName, 300) ||
    !isText(row.label, 500) ||
    typeof row.currency !== 'string' ||
    !/^[A-Z]{3}$/u.test(row.currency) ||
    !isText(row.status, 100) ||
    typeof row.occurredAt !== 'string' ||
    !Number.isFinite(Date.parse(row.occurredAt)) ||
    !MONEY_KEYS.every((key) => isMoney(row[key])) ||
    !Array.isArray(row.lines) ||
    !Array.isArray(row.refunds)
  ) {
    return null;
  }
  if (row.receiptKind === 'invoice' && row.receiptId !== row.invoiceId) return null;
  if (
    row.totalMinor !==
      (row.subtotalMinor as number) - (row.discountMinor as number) + (row.vatMinor as number) ||
    (row.refundedMinor as number) > (row.paidMinor as number)
  ) {
    return null;
  }
  const lines = row.lines.filter(isReceiptLine);
  const refunds = row.refunds.filter(isReceiptRefund);
  if (lines.length !== row.lines.length || refunds.length !== row.refunds.length) return null;
  return {
    ...(row as unknown as ReceiptSnapshot),
    tenantColor: /^#[0-9a-f]{6}$/iu.test(String(row.tenantColor)) ? String(row.tenantColor) : null,
    customerName: typeof row.customerName === 'string' ? row.customerName.slice(0, 300) : null,
    paymentMethod: typeof row.paymentMethod === 'string' ? row.paymentMethod.slice(0, 100) : null,
    lines,
    refunds,
  };
}

export function receiptDownloadHeaders(
  kind: ReceiptKind,
  id: string,
): Record<'cache-control' | 'content-disposition' | 'content-type', string> {
  const safe = id
    .replace(/[\u0000-\u001f\u007f]/gu, '-')
    .replace(/[^a-zA-Z0-9-]+/gu, '-')
    .replace(/-+/gu, '-')
    .replace(/^-|-$/gu, '')
    .slice(0, 100);
  return {
    'cache-control': 'private, no-store',
    'content-disposition': `inline; filename="receipt-${kind}-${safe || 'record'}.pdf"`,
    'content-type': 'application/pdf',
  };
}

export function receiptSnapshotToPdfInput(snapshot: ReceiptSnapshot): ReceiptPdfInput {
  return {
    tenantName: snapshot.tenantName,
    tenantColor: snapshot.tenantColor,
    companyName: snapshot.companyName,
    customerName: snapshot.customerName,
    invoiceId: snapshot.invoiceId,
    label: snapshot.label,
    amount: formatMoney(snapshot.totalMinor, snapshot.currency),
    status: snapshot.status,
    paidAt: snapshot.occurredAt,
    paymentMethod: snapshot.paymentMethod,
    paymentProvider: null,
    refunds: snapshot.refunds.map((refund) => ({
      amount: formatMoney(refund.amountMinor, snapshot.currency),
      reason: refund.reason,
      status: refund.status,
    })),
    subtotal: formatMoney(snapshot.subtotalMinor, snapshot.currency),
    discount: formatMoney(snapshot.discountMinor, snapshot.currency),
    vat: formatMoney(snapshot.vatMinor, snapshot.currency),
    paid: formatMoney(snapshot.paidMinor, snapshot.currency),
    refunded: formatMoney(snapshot.refundedMinor, snapshot.currency),
  };
}

export async function loadAuthoritativeReceipt(input: {
  tenantId: string;
  companyId: string;
  actorId: string;
  actorRole: 'customer' | 'pro';
  invoiceId: string;
  selection: ReceiptSelection;
}): Promise<ReceiptSnapshot | null> {
  const { createSupabaseServiceRoleClient } = await import('@/lib/supabase/service-role');
  const admin = createSupabaseServiceRoleClient();
  const { data, error } = await admin.rpc(
    'p309_generate_finance_receipt' as never,
    {
      p_tenant_id: input.tenantId,
      p_company_id: input.companyId,
      p_actor_id: input.actorId,
      p_actor_role: input.actorRole,
      p_invoice_id: input.invoiceId,
      p_receipt_kind: input.selection.kind,
      p_receipt_id: input.selection.id,
    } as never,
  );
  return error ? null : sanitizeReceiptSnapshot(data);
}

function isMoney(value: unknown): value is number {
  return (
    Number.isSafeInteger(value) && (value as number) >= 0 && (value as number) <= 100_000_000_000
  );
}

function isText(value: unknown, max: number): value is string {
  return typeof value === 'string' && value.trim().length > 0 && value.length <= max;
}

function isReceiptLine(value: unknown): value is ReceiptSnapshot['lines'][number] {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    isText(row.description, 500) &&
    isMoney(row.netMinor) &&
    isMoney(row.vatMinor) &&
    isMoney(row.totalMinor) &&
    row.totalMinor === (row.netMinor as number) + (row.vatMinor as number)
  );
}

function isReceiptRefund(value: unknown): value is ReceiptSnapshot['refunds'][number] {
  if (!value || typeof value !== 'object') return false;
  const row = value as Record<string, unknown>;
  return (
    isText(row.id, 200) &&
    isMoney(row.amountMinor) &&
    isText(row.status, 100) &&
    (row.reason === null || typeof row.reason === 'string')
  );
}
