process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://test.supabase.co';
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'anon_key_for_tests_padded_to_min_';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'service_role_key_for_tests_padded_';
process.env.NEXT_PUBLIC_ROOT_DOMAIN = 'localhost:3001';
process.env.VIRUSTOTAL_API_KEY = 'vt_test_key';

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Socket } from 'node:net';

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

test('scanFile accepts a clean file through an isolated ClamAV INSTREAM endpoint', async () => {
  const { scanFile } = await load();
  const result = await scanFile(Buffer.from('%PDF-1.4 clean'), {
    filename: 'clean.pdf',
    timeoutMs: 5_000,
    clamav: { host: '127.0.0.1', port: 3310 },
    clamavScanner: async (data, endpoint, timeoutMs) => {
      assert.equal(Buffer.from(data).toString('utf8'), '%PDF-1.4 clean');
      assert.deepEqual(endpoint, { host: '127.0.0.1', port: 3310 });
      assert.equal(timeoutMs, 5_000);
      return { clean: true, provider: 'clamav' };
    },
  });
  assert.deepEqual(result, { clean: true, provider: 'clamav' });
});

test('private scan fails closed without ClamAV and never calls global fetch', async () => {
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('credential evidence must never leave the private scanner boundary');
  };
  const { scanFilePrivate } = await load();

  const result = await scanFilePrivate(Buffer.from('%PDF-1.4 private evidence'), {
    clamav: null,
  });

  assert.deepEqual(result, {
    clean: false,
    reason: 'scanner_unavailable',
    provider: 'clamav',
  });
  assert.equal(fetchCalls, 0);
});

test('private scan uses configured ClamAV without VirusTotal fallback when it is unavailable', async () => {
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls += 1;
    throw new Error('unexpected third-party upload');
  };
  const { scanFilePrivate } = await load();

  const result = await scanFilePrivate(Buffer.from('%PDF-1.4 private evidence'), {
    clamav: { host: '127.0.0.1', port: 3310 },
    clamavScanner: async () => {
      throw new Error('private scanner unavailable');
    },
  });

  assert.deepEqual(result, {
    clean: false,
    reason: 'scanner_unavailable',
    provider: 'clamav',
  });
  assert.equal(fetchCalls, 0);
});

async function withClamAvServer(
  respond: (socket: Socket) => void,
  scan: (endpoint: { host: string; port: number }) => Promise<void>,
) {
  const sockets = new Set<Socket>();
  const server = createServer({ allowHalfOpen: true }, (socket) => {
    sockets.add(socket);
    socket.on('error', () => undefined);
    socket.once('close', () => sockets.delete(socket));
    socket.once('data', () => respond(socket));
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  try {
    await scan({ host: '127.0.0.1', port: address.port });
  } finally {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve, reject) =>
      server.close((error) => (error ? reject(error) : resolve())),
    );
  }
}

for (const [label, response, expected] of [
  ['OK', 'stream: OK\0', { clean: true, provider: 'clamav' }],
  [
    'FOUND',
    'stream: Synthetic.Test FOUND\0',
    { clean: false, reason: 'malware_detected', provider: 'clamav' },
  ],
] as const) {
  test(`ClamAV TCP protocol handles ${label}`, async () => {
    await withClamAvServer(
      (socket) => socket.end(response),
      async (clamav) => {
        const { scanFile } = await load();
        assert.deepEqual(
          await scanFile(Buffer.from('fixture'), { clamav, timeoutMs: 5_000 }),
          expected,
        );
      },
    );
  });
}

test('ClamAV TCP protocol fails closed on socket error and no response', async () => {
  for (const mode of ['error', 'silent'] as const) {
    await withClamAvServer(
      (socket) => {
        if (mode === 'error') socket.destroy(new Error('synthetic scanner failure'));
      },
      async (clamav) => {
        const { scanFile } = await load();
        assert.deepEqual(await scanFile(Buffer.from('fixture'), { clamav, timeoutMs: 30 }), {
          clean: false,
          reason: 'scanner_unavailable',
          provider: 'clamav',
        });
      },
    );
  }
});

test(
  'ClamAV TCP deadline is absolute even when a peer slowly drips bytes',
  { timeout: 2_000 },
  async () => {
    let peerReturnedValidResult = false;
    let returnValidResult = () => false;
    await withClamAvServer(
      (socket) => {
        const interval = setInterval(() => socket.write('x'), 25);
        returnValidResult = () => {
          if (socket.destroyed) return false;
          peerReturnedValidResult = true;
          socket.end('stream: OK\0');
          return true;
        };
        socket.once('close', () => clearInterval(interval));
      },
      async (clamav) => {
        const { scanFile } = await load();
        const result = await scanFile(Buffer.from('fixture'), { clamav, timeoutMs: 100 });
        assert.deepEqual(result, {
          clean: false,
          reason: 'scanner_unavailable',
          provider: 'clamav',
        });
        assert.equal(peerReturnedValidResult, false, 'scanner settles before the peer returns OK');
        assert.equal(
          returnValidResult(),
          true,
          'peer control can still return a valid OK response',
        );
      },
    );
  },
);

test('ClamAV TCP response is byte-bounded despite a valid OK suffix', async () => {
  await withClamAvServer(
    (socket) => {
      socket.end(Buffer.concat([Buffer.alloc(4_097, 'x'), Buffer.from('stream: OK\0')]));
    },
    async (clamav) => {
      const { scanFile } = await load();
      const result = await scanFile(Buffer.from('fixture'), { clamav, timeoutMs: 5_000 });
      assert.deepEqual(result, {
        clean: false,
        reason: 'scanner_unavailable',
        provider: 'clamav',
      });
    },
  );
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
