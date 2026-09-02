import assert from 'node:assert/strict';
import test from 'node:test';

import {
  applicationSignalHref,
  applicationDeadlineQuery,
  parseApplicationSignalFilter,
  parsePaymentSignalFilter,
  parseRenewalSignalFilter,
  paymentSignalHref,
  renewalSignalHref,
  withApplicationScope,
} from './signal-studio-filters';

test('application signal URLs round-trip semantic open and Dubai deadline filters', () => {
  assert.deepEqual(parseApplicationSignalFilter({ view: 'open' }), { view: 'open' });
  const deadline = { date: '2026-08-12', period: 'morning' as const, eventTypes: 'case' as const };
  const href = applicationSignalHref('north star', deadline);
  assert.equal(href, '/t/north%20star/applications?date=2026-08-12&period=morning&eventTypes=case');
  assert.deepEqual(
    parseApplicationSignalFilter(
      Object.fromEntries(new URL(href, 'https://mandoob.test').searchParams),
    ),
    deadline,
  );
  assert.deepEqual(parseApplicationSignalFilter({ date: 'bad', period: 'night' }), {});
  assert.deepEqual(
    parseApplicationSignalFilter({ date: '9999-99-99', period: 'morning', eventTypes: 'case' }),
    {},
  );
});

test('application signal URLs preserve only the supported service filter', () => {
  const scope = {
    serviceType: 'Golden visa',
  };
  assert.equal(
    applicationSignalHref('acme', { view: 'open' }, scope),
    '/t/acme/applications?view=open&serviceType=Golden+visa',
  );
  assert.equal(
    withApplicationScope('/t/acme/applications?case=case-1', scope),
    '/t/acme/applications?case=case-1&serviceType=Golden+visa',
  );
});

test('application deadline query maps Dubai morning and afternoon without overlap', () => {
  assert.equal(
    applicationDeadlineQuery('2026-08-12', 'morning'),
    'and(sla_due_at.gte.2026-08-11T20:00:00.000Z,sla_due_at.lt.2026-08-12T08:00:00.000Z),and(sla_due_at.is.null,due_at.gte.2026-08-11T20:00:00.000Z,due_at.lt.2026-08-12T08:00:00.000Z)',
  );
  assert.equal(
    applicationDeadlineQuery('2026-08-12', 'afternoon'),
    'and(sla_due_at.gte.2026-08-12T08:00:00.000Z,sla_due_at.lt.2026-08-12T20:00:00.000Z),and(sla_due_at.is.null,due_at.gte.2026-08-12T08:00:00.000Z,due_at.lt.2026-08-12T20:00:00.000Z)',
  );
  assert.doesNotMatch(applicationDeadlineQuery('2026-08-12', 'afternoon'), /due_at\.eq/);
});

test('renewal signal URLs parse type, day window, target UUID, and active tab together', () => {
  const target = '88888888-8888-4888-8888-888888888888';
  assert.deepEqual(parseRenewalSignalFilter({ tab: 'active', type: 'visa', days: '30', target }), {
    tab: 'active',
    type: 'visa',
    days: 30,
    renewalId: target,
  });
  assert.equal(
    renewalSignalHref('acme', { tab: 'active', renewalId: target }),
    `/t/acme/renewals?tab=active&target=${target}`,
  );
  assert.equal(
    renewalSignalHref('acme', { tab: 'active', type: 'eid', days: 90 }),
    '/t/acme/renewals?tab=active&type=eid&days=90',
  );
  assert.deepEqual(parseRenewalSignalFilter({ type: 'passport', days: '45' }), { tab: 'active' });
});

test('deadline event URLs round-trip renewal and invoice date filters', () => {
  const renewal = renewalSignalHref('acme', {
    tab: 'active',
    date: '2026-08-12',
    period: 'afternoon',
  });
  assert.deepEqual(
    parseRenewalSignalFilter(Object.fromEntries(new URL(renewal, 'https://x').searchParams)),
    { tab: 'active', date: '2026-08-12', period: 'afternoon' },
  );
  const invoice = paymentSignalHref('acme', {
    view: 'due-date',
    date: '2026-08-12',
    period: 'afternoon',
  });
  assert.deepEqual(
    parsePaymentSignalFilter(Object.fromEntries(new URL(invoice, 'https://x').searchParams)),
    { view: 'due-date', date: '2026-08-12', period: 'afternoon' },
  );
});

test('payment signal URLs emit and consume only supported collection views', () => {
  for (const view of ['billed', 'paid', 'due-soon', 'overdue'] as const) {
    const href = paymentSignalHref('acme', { view });
    assert.equal(href, `/t/acme/payments?view=${view}`);
    assert.deepEqual(
      parsePaymentSignalFilter(
        Object.fromEntries(new URL(href, 'https://mandoob.test').searchParams),
      ),
      { view },
    );
  }
  assert.deepEqual(parsePaymentSignalFilter({ view: 'collected', period: 'month' }), {
    view: 'all',
  });
});
