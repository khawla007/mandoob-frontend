import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { dashboardHref } from './dashboard-links';

describe('dashboardHref', () => {
  it('encodes tenant slugs and values containing spaces', () => {
    assert.equal(
      dashboardHref('north star', 'applications', { status: 'authority review' }),
      '/t/north%20star/applications?status=authority+review',
    );
  });

  it('serializes comma-delimited renewal filters', () => {
    assert.equal(
      dashboardHref('acme', 'renewals', { type: 'license,visa', days: '30' }),
      '/t/acme/renewals?type=license%2Cvisa&days=30',
    );
  });

  it('preserves UUID owner filters for documents', () => {
    assert.equal(
      dashboardHref('acme', 'documents', {
        owner: '985f4230-016b-40c6-b3ba-7ecbbcbce7dd',
      }),
      '/t/acme/documents?owner=985f4230-016b-40c6-b3ba-7ecbbcbce7dd',
    );
  });

  it('targets every consumed payments collection view', () => {
    for (const view of ['billed', 'paid', 'due-soon', 'overdue']) {
      assert.equal(dashboardHref('acme', 'payments', { view }), `/t/acme/payments?view=${view}`);
    }
  });
});
