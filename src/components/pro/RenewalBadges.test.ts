import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import {
  RENEWAL_STATUS_LABEL,
  RENEWAL_STATUS_VARIANT,
  RENEWAL_TYPE_LABEL,
} from './renewal-badge-maps';

describe('RenewalBadges maps', () => {
  it('covers every renewal status in label and variant maps', () => {
    const statuses = ['upcoming', 'due_soon', 'overdue', 'completed', 'cancelled'];
    for (const s of statuses) {
      assert.ok(RENEWAL_STATUS_LABEL[s as keyof typeof RENEWAL_STATUS_LABEL], `label for ${s}`);
      assert.ok(
        RENEWAL_STATUS_VARIANT[s as keyof typeof RENEWAL_STATUS_VARIANT],
        `variant for ${s}`,
      );
    }
  });

  it('uses destructive for overdue and outline for cancelled', () => {
    assert.equal(RENEWAL_STATUS_VARIANT.overdue, 'destructive');
    assert.equal(RENEWAL_STATUS_VARIANT.cancelled, 'outline');
    assert.equal(RENEWAL_STATUS_VARIANT.completed, 'default');
  });

  it('covers all four renewal types in the type label map', () => {
    assert.equal(RENEWAL_TYPE_LABEL.license, 'License');
    assert.equal(RENEWAL_TYPE_LABEL.visa, 'Visa');
    assert.equal(RENEWAL_TYPE_LABEL.eid, 'EID');
    assert.equal(RENEWAL_TYPE_LABEL.ejari, 'Ejari');
  });
});
