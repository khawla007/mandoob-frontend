import assert from 'node:assert/strict';
import { test } from 'node:test';
import { generateEstimatePdf } from './estimate';

test('generateEstimatePdf returns a non-empty PDF document', async () => {
  const bytes = await generateEstimatePdf({
    reference: 'EST-ABC1234567',
    jurisdictionLabel: 'DMCC Free Zone',
    activityLabel: 'Consulting',
    generatedAt: '2026-05-07T08:00:00.000Z',
    oneTimeTotal: 'AED 19,000.00',
    annualTotal: 'AED 21,500.00',
    timeline: '23-44 business days',
    lineItems: [
      { label: 'Registration and name reservation', quantity: 1, recurrence: 'one_time', total: 'AED 8,500.00' },
      { label: 'DMCC service license', quantity: 1, recurrence: 'annual', total: 'AED 12,500.00' },
    ],
    requiredDocuments: ['Passport copy', 'Passport photo'],
    assumptions: ['Estimate-grade public pricing. Government and authority fees may change.'],
  });

  assert.ok(bytes.length > 800);
  assert.equal(Buffer.from(bytes.subarray(0, 4)).toString('utf8'), '%PDF');
});
