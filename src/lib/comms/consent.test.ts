process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3000';

import { test } from 'node:test';
import assert from 'node:assert/strict';

type ConsentModule = typeof import('./consent');
let mod: ConsentModule | null = null;
async function load(): Promise<ConsentModule> {
  if (!mod) mod = await import('./consent');
  return mod;
}

test('normalizeConsentKeyword detects STOP-family opt-outs case-insensitively', async () => {
  const { normalizeConsentKeyword } = await load();
  for (const body of ['STOP', ' stop ', 'Unsubscribe', '\nEND\t', 'cancel', 'QUIT']) {
    assert.equal(normalizeConsentKeyword(body), 'opt_out');
  }
});

test('normalizeConsentKeyword detects START-family opt-ins case-insensitively', async () => {
  const { normalizeConsentKeyword } = await load();
  for (const body of ['START', ' start ', 'Unstop', '\nSUBSCRIBE\t', 'resume']) {
    assert.equal(normalizeConsentKeyword(body), 'opt_in');
  }
});

test('normalizeConsentKeyword ignores non-keyword text', async () => {
  const { normalizeConsentKeyword } = await load();
  assert.equal(normalizeConsentKeyword('please stop sending invoices'), null);
  assert.equal(normalizeConsentKeyword(''), null);
  assert.equal(normalizeConsentKeyword(null), null);
});

test('isRecipientOptedOut returns false for a fresh phone', async () => {
  const { isRecipientOptedOut } = await load();
  const supabase = fakeConsentSelect(null);
  assert.equal(await isRecipientOptedOut('+971500000001', 'sms', supabase as never), false);
});

test('isRecipientOptedOut returns true for an active opt-out row', async () => {
  const { isRecipientOptedOut } = await load();
  const supabase = fakeConsentSelect({ id: 'opt-1' });
  assert.equal(await isRecipientOptedOut('+971500000001', 'whatsapp', supabase as never), true);
});

test('recordInboundConsentKeyword opts out then opts in by closing active rows', async () => {
  const calls: Array<{ table: string; op: string; payload?: unknown }> = [];
  const supabase = {
    from(table: string) {
      return {
        insert(payload: unknown) {
          calls.push({ table, op: 'insert', payload });
          return Promise.resolve({ error: null });
        },
        update(payload: unknown) {
          calls.push({ table, op: 'update', payload });
          return {
            eq() {
              return {
                eq() {
                  return {
                    is() {
                      return Promise.resolve({ error: null });
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
  const { recordInboundConsentKeyword } = await load();

  assert.equal(
    await recordInboundConsentKeyword({
      supabase: supabase as never,
      phoneE164: '+971500000001',
      channel: 'sms',
      body: ' STOP ',
      inboundMessageId: 'SM1',
    }),
    'opt_out',
  );
  assert.equal(
    await recordInboundConsentKeyword({
      supabase: supabase as never,
      phoneE164: '+971500000001',
      channel: 'sms',
      body: 'START',
      inboundMessageId: 'SM2',
    }),
    'opt_in',
  );

  assert.equal(calls[0].table, 'consent_opt_outs');
  assert.equal(calls[0].op, 'insert');
  assert.equal(calls[1].table, 'consent_opt_outs');
  assert.equal(calls[1].op, 'update');
});

function fakeConsentSelect(row: { id: string } | null) {
  return {
    from(table: string) {
      assert.equal(table, 'consent_opt_outs');
      return {
        select() {
          return {
            eq() {
              return {
                eq() {
                  return {
                    is() {
                      return {
                        maybeSingle() {
                          return Promise.resolve({ data: row, error: null });
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
      };
    },
  };
}
