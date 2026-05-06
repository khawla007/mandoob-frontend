import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { groupFailedLoginsByIp, parseLockoutKey } from './security-helpers';

describe('groupFailedLoginsByIp', () => {
  it('returns empty for empty input', () => {
    assert.deepEqual(groupFailedLoginsByIp([]), []);
  });

  it('groups by ip, drops nulls, sorts desc by count', () => {
    const out = groupFailedLoginsByIp([
      { ip: '1.2.3.4' },
      { ip: '1.2.3.4' },
      { ip: '5.6.7.8' },
      { ip: null },
      { ip: '1.2.3.4' },
    ]);
    assert.deepEqual(out, [
      { ip: '1.2.3.4', count: 3 },
      { ip: '5.6.7.8', count: 1 },
    ]);
  });

  it('handles a single ip', () => {
    assert.deepEqual(groupFailedLoginsByIp([{ ip: '9.9.9.9' }]), [{ ip: '9.9.9.9', count: 1 }]);
  });
});

describe('parseLockoutKey', () => {
  it('parses acct: prefix preserving original case in value', () => {
    assert.deepEqual(parseLockoutKey('acct:User@Example.com'), {
      kind: 'acct',
      value: 'User@Example.com',
    });
  });

  it('parses net: prefix with CIDR', () => {
    assert.deepEqual(parseLockoutKey('net:192.168.1.0/24'), {
      kind: 'net',
      value: '192.168.1.0/24',
    });
  });

  it('parses IPv6 net key', () => {
    assert.deepEqual(parseLockoutKey('net:2001:db8:0:0::/64'), {
      kind: 'net',
      value: '2001:db8:0:0::/64',
    });
  });

  it('returns null for malformed or missing key', () => {
    assert.equal(parseLockoutKey(null), null);
    assert.equal(parseLockoutKey(''), null);
    assert.equal(parseLockoutKey('weird:key'), null);
  });
});
