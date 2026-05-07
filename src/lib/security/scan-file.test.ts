process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3000';
process.env.VIRUSTOTAL_API_KEY = 'vt_test_key';

import { test } from 'node:test';
import assert from 'node:assert/strict';

type ScanModule = typeof import('./scan-file');
let mod: ScanModule | null = null;
async function load(): Promise<ScanModule> {
  if (!mod) mod = await import('./scan-file');
  return mod;
}

const originalFetch = globalThis.fetch;

function mockFetch(responses: Response[]) {
  let calls = 0;
  globalThis.fetch = async () => {
    const response = responses[calls];
    calls += 1;
    if (!response) throw new Error('unexpected fetch call');
    return response;
  };
  return () => calls;
}

test.afterEach(() => {
  globalThis.fetch = originalFetch;
});

test('scanFile rejects the EICAR test vector locally', async () => {
  const { scanFile } = await load();
  const eicar = 'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*';

  const result = await scanFile(Buffer.from(eicar));

  assert.equal(result.clean, false);
  assert.equal(result.reason, 'eicar_test');
  assert.equal(result.provider, 'local');
});

test('scanFile returns clean when VirusTotal completes with no detections', async () => {
  const getCalls = mockFetch([
    Response.json({ data: { id: 'analysis-id' } }),
    Response.json({
      data: {
        attributes: {
          status: 'completed',
          stats: { malicious: 0, suspicious: 0 },
        },
      },
    }),
  ]);
  const { scanFile } = await load();

  const result = await scanFile(Buffer.from('%PDF-1.4 clean'), {
    filename: 'clean.pdf',
    timeoutMs: 1_000,
    pollIntervalMs: 1,
  });

  assert.equal(result.clean, true);
  assert.equal(result.provider, 'virustotal');
  assert.equal(getCalls(), 2);
});

test('scanFile fails closed when VirusTotal reports detections', async () => {
  mockFetch([
    Response.json({ data: { id: 'analysis-id' } }),
    Response.json({
      data: {
        attributes: {
          status: 'completed',
          stats: { malicious: 1, suspicious: 0 },
        },
      },
    }),
  ]);
  const { scanFile } = await load();

  const result = await scanFile(Buffer.from('%PDF-1.4 infected'), {
    filename: 'infected.pdf',
    timeoutMs: 1_000,
    pollIntervalMs: 1,
  });

  assert.equal(result.clean, false);
  assert.equal(result.reason, 'malware_detected');
  assert.equal(result.provider, 'virustotal');
});

test('scanFile fails closed on provider HTTP errors', async () => {
  mockFetch([new Response('upstream error', { status: 500 })]);
  const { scanFile } = await load();

  const result = await scanFile(Buffer.from('%PDF-1.4 clean'), {
    filename: 'clean.pdf',
    timeoutMs: 1_000,
    pollIntervalMs: 1,
  });

  assert.equal(result.clean, false);
  assert.equal(result.reason, 'scanner_unavailable');
  assert.equal(result.provider, 'virustotal');
});

test('scanFile fails closed when provider analysis times out', async () => {
  mockFetch([
    Response.json({ data: { id: 'analysis-id' } }),
    Response.json({ data: { attributes: { status: 'queued', stats: {} } } }),
    Response.json({ data: { attributes: { status: 'queued', stats: {} } } }),
  ]);
  const { scanFile } = await load();

  const result = await scanFile(Buffer.from('%PDF-1.4 clean'), {
    filename: 'clean.pdf',
    timeoutMs: 1,
    pollIntervalMs: 5,
  });

  assert.equal(result.clean, false);
  assert.equal(result.reason, 'scanner_unavailable');
  assert.equal(result.provider, 'virustotal');
});
