import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { encodeCursor, decodeCursor } from './audit-log-cursor';

describe('audit-log cursor', () => {
  it('round-trips ts + id', () => {
    const c = { ts: '2026-05-05T12:34:56.000Z', id: '42' };
    const e = encodeCursor(c);
    assert.equal(typeof e, 'string');
    assert.notEqual(e.length, 0);
    assert.deepEqual(decodeCursor(e), c);
  });

  it('returns null for empty / malformed input', () => {
    assert.equal(decodeCursor(null), null);
    assert.equal(decodeCursor(''), null);
    assert.equal(decodeCursor(undefined), null);
    assert.equal(decodeCursor('!!!not-base64!!!'), null);
  });

  it('returns null when payload missing pipe', () => {
    const broken = Buffer.from('no-pipe-here').toString('base64url');
    assert.equal(decodeCursor(broken), null);
  });

  it('handles uuid-style ids in cursor', () => {
    const c = { ts: '2026-01-01T00:00:00.000Z', id: '11111111-1111-4111-8111-111111111111' };
    assert.deepEqual(decodeCursor(encodeCursor(c)), c);
  });
});
