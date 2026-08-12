import assert from 'node:assert/strict';
import test from 'node:test';

import { buildDeadlineDrilldowns } from './deadline-heatmap-links';

test('every counted document deadline keeps its own reachable href', () => {
  const documents = Array.from({ length: 3 }, (_, index) => ({
    id: `document-${index}`,
    date: '2026-08-12',
    period: 'afternoon' as const,
    eventType: 'document' as const,
    href: `/t/acme/clients/client-${index}?tab=documents&request=document-${index}`,
    title: `Request ${index}`,
    clientName: `Client ${index}`,
  }));
  const links = buildDeadlineDrilldowns(documents, 'acme', '2026-08-12', 'afternoon');
  assert.equal(links.length, 3);
  assert.deepEqual(
    links.map((link) => link.href),
    documents.map((event) => event.href),
  );
  assert.equal(new Set(links.map((link) => link.key)).size, 3);
  assert.ok(links.every((link) => link.count === 1 && link.event?.title));
});

test('case, renewal and invoice deadlines retain aggregate consumed filters', () => {
  const events = (['case', 'renewal', 'invoice'] as const).map((eventType) => ({
    id: eventType,
    date: '2026-08-12',
    period: 'afternoon' as const,
    eventType,
    href: `/ignored/${eventType}`,
    title: eventType,
    clientName: 'Acme',
  }));
  const links = buildDeadlineDrilldowns(events, 'north star', '2026-08-12', 'afternoon');
  assert.equal(links.length, 3);
  assert.match(links[0].href, /^\/t\/north%20star\/applications\?/);
  assert.match(links[1].href, /^\/t\/north%20star\/renewals\?/);
  assert.match(links[2].href, /^\/t\/north%20star\/payments\?/);
});

test('case deadline drilldowns preserve normalized dashboard application filters', () => {
  const events = [
    {
      id: 'case',
      date: '2026-08-12',
      period: 'morning' as const,
      eventType: 'case' as const,
      href: '/ignored/case',
      title: 'Golden visa',
      clientName: 'Acme',
    },
  ];
  const links = buildDeadlineDrilldowns(events, 'acme', '2026-08-12', 'morning', {
    ownerId: '11111111-1111-4111-8111-111111111111',
    serviceType: 'Golden visa',
  });
  assert.equal(
    links[0].href,
    '/t/acme/applications?date=2026-08-12&period=morning&eventTypes=case&owner=11111111-1111-4111-8111-111111111111&serviceType=Golden+visa',
  );
});
