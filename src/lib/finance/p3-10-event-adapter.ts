import {
  EVENT_INTERFACE_VERSION,
  parseRegisteredDomainEvent,
  type DomainEventEnvelope,
  type EventSchemaRegistry,
} from '@/lib/events/contracts';

export const P309_EVENT_INTERFACE_VERSION = EVENT_INTERFACE_VERSION;

const resourceOperationAmountSchema = {
  resource_id: 'uuid',
  operation_id: 'uuid',
  version: 'integer',
  state: 'state',
  amount_minor: 'integer',
  currency: 'reference',
} as const;

const paymentOperationAmountSchema = {
  resource_id: 'uuid',
  invoice_id: 'uuid',
  operation_id: 'uuid',
  state: 'state',
  amount_minor: 'integer',
  currency: 'reference',
} as const;

export const P309_FINANCE_EVENT_SCHEMAS_V1 = {
  'finance.invoice.created': { 1: resourceOperationAmountSchema },
  'finance.invoice.finalized': { 1: resourceOperationAmountSchema },
  'finance.invoice.voided': { 1: resourceOperationAmountSchema },
  'finance.payment.allocated': {
    1: { ...resourceOperationAmountSchema, invoice_id: 'uuid' },
  },
  'finance.refund.prepared': {
    1: { ...resourceOperationAmountSchema, invoice_id: 'uuid', payment_id: 'uuid' },
  },
  'finance.refund.reconciled': {
    1: { ...resourceOperationAmountSchema, invoice_id: 'uuid', payment_id: 'uuid' },
  },
  'finance.expense.posted': { 1: resourceOperationAmountSchema },
  'finance.compensation.posted': { 1: resourceOperationAmountSchema },
  'finance.bank_evidence.submitted': {
    1: {
      resource_id: 'uuid',
      invoice_id: 'uuid',
      operation_id: 'uuid',
      document_id: 'uuid',
      version_id: 'uuid',
      version: 'integer',
      state: 'state',
    },
  },
  'finance.bank_evidence.reviewed': {
    1: {
      resource_id: 'uuid',
      invoice_id: 'uuid',
      operation_id: 'uuid',
      version: 'integer',
      state: 'state',
    },
  },
  'finance.payment.reserved': { 1: paymentOperationAmountSchema },
  'finance.payment.reconciled': { 1: paymentOperationAmountSchema },
  'billing.subscription.changed': {
    1: {
      subscription_id: 'reference',
      plan: 'state',
      status: 'state',
      version: 'integer',
    },
  },
} as const satisfies EventSchemaRegistry;

/** Validates the frozen P3.10 envelope and the exact reference-only P3.09 payload. */
export function parseP309FinanceEvent(input: unknown): DomainEventEnvelope {
  const event = parseRegisteredDomainEvent(input, P309_FINANCE_EVENT_SCHEMAS_V1);
  const operationId = event.payload.operation_id;
  if (typeof operationId === 'string' && event.correlationId !== operationId) {
    throw new Error('EVENT_CORRELATION_MISMATCH');
  }
  return event;
}
