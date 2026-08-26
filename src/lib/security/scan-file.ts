import 'server-only';
import { createConnection } from 'node:net';
import { env } from '@/lib/env';

export type FileScanResult = {
  clean: boolean;
  reason?: string;
  provider?: string;
};

export type ScanFileOptions = {
  filename?: string;
  timeoutMs?: number;
  pollIntervalMs?: number;
  clamav?: { host: string; port: number };
  clamavScanner?: (
    data: Uint8Array,
    endpoint: { host: string; port: number },
    timeoutMs: number,
  ) => Promise<FileScanResult>;
};

const VIRUSTOTAL_API_BASE = 'https://www.virustotal.com/api/v3';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
const MAX_CLAMAV_RESPONSE_BYTES = 4_096;
const EICAR_SIGNATURE = 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE';

type VirusTotalAnalysis = {
  data?: {
    id?: string;
    attributes?: {
      status?: string;
      stats?: {
        malicious?: number;
        suspicious?: number;
      };
    };
  };
};

function toUint8Array(buf: ArrayBuffer | Uint8Array): Uint8Array {
  return buf instanceof Uint8Array ? buf : new Uint8Array(buf);
}

function containsEicar(buf: Uint8Array): boolean {
  return Buffer.from(buf).toString('utf8').includes(EICAR_SIGNATURE);
}

function unavailable(provider = 'virustotal'): FileScanResult {
  return { clean: false, reason: 'scanner_unavailable', provider };
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseClamAvResponse(response: string): FileScanResult {
  if (/\bOK\s*\0?$/u.test(response)) return { clean: true, provider: 'clamav' };
  if (/\bFOUND\s*\0?$/u.test(response))
    return { clean: false, reason: 'malware_detected', provider: 'clamav' };
  return unavailable('clamav');
}

async function scanWithClamAv(
  data: Uint8Array,
  endpoint: { host: string; port: number },
  timeoutMs: number,
): Promise<FileScanResult> {
  return new Promise((resolve) => {
    let response = '';
    let responseBytes = 0;
    let settled = false;
    const socket = createConnection(endpoint);
    const deadline = setTimeout(() => finish(unavailable('clamav')), timeoutMs);
    const finish = (result: FileScanResult) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadline);
      socket.destroy();
      resolve(result);
    };
    socket.once('connect', () => {
      socket.write(Buffer.from('zINSTREAM\0', 'utf8'));
      const length = Buffer.allocUnsafe(4);
      length.writeUInt32BE(data.byteLength);
      socket.write(length);
      socket.write(data);
      socket.end(Buffer.alloc(4));
    });
    socket.on('data', (chunk: Buffer) => {
      responseBytes += chunk.byteLength;
      if (responseBytes > MAX_CLAMAV_RESPONSE_BYTES) {
        finish(unavailable('clamav'));
        return;
      }
      response += chunk.toString('utf8');
      if (response.includes('\0') || response.includes('\n')) finish(parseClamAvResponse(response));
    });
    socket.once('end', () => finish(parseClamAvResponse(response)));
    socket.once('error', () => finish(unavailable('clamav')));
  });
}

function readStats(payload: VirusTotalAnalysis): {
  status: string | undefined;
  malicious: number;
  suspicious: number;
} {
  const attrs = payload.data?.attributes;
  return {
    status: attrs?.status,
    malicious: attrs?.stats?.malicious ?? 0,
    suspicious: attrs?.stats?.suspicious ?? 0,
  };
}

async function uploadToVirusTotal(buf: Uint8Array, filename: string): Promise<string | null> {
  if (!env.VIRUSTOTAL_API_KEY) return null;

  const fileBytes = new ArrayBuffer(buf.byteLength);
  new Uint8Array(fileBytes).set(buf);
  const form = new FormData();
  form.append('file', new Blob([fileBytes]), filename);

  const response = await fetch(`${VIRUSTOTAL_API_BASE}/files`, {
    method: 'POST',
    headers: { 'x-apikey': env.VIRUSTOTAL_API_KEY },
    body: form,
  });
  if (!response.ok) return null;

  const payload = (await response.json()) as VirusTotalAnalysis;
  return payload.data?.id ?? null;
}

async function pollVirusTotalAnalysis(
  analysisId: string,
  timeoutMs: number,
  pollIntervalMs: number,
): Promise<FileScanResult> {
  if (!env.VIRUSTOTAL_API_KEY) return unavailable();

  const deadline = Date.now() + timeoutMs;
  while (Date.now() <= deadline) {
    const response = await fetch(
      `${VIRUSTOTAL_API_BASE}/analyses/${encodeURIComponent(analysisId)}`,
      {
        headers: { 'x-apikey': env.VIRUSTOTAL_API_KEY },
      },
    );
    if (!response.ok) return unavailable();

    const stats = readStats((await response.json()) as VirusTotalAnalysis);
    if (stats.status === 'completed') {
      if (stats.malicious > 0 || stats.suspicious > 0) {
        return { clean: false, reason: 'malware_detected', provider: 'virustotal' };
      }
      return { clean: true, provider: 'virustotal' };
    }

    await delay(pollIntervalMs);
  }

  return unavailable();
}

export async function scanFile(
  buf: ArrayBuffer | Uint8Array,
  opts: ScanFileOptions = {},
): Promise<FileScanResult> {
  const data = toUint8Array(buf);
  if (containsEicar(data)) {
    return { clean: false, reason: 'eicar_test', provider: 'local' };
  }

  const clamav =
    opts.clamav ??
    (env.CLAMAV_HOST && env.CLAMAV_PORT
      ? { host: env.CLAMAV_HOST, port: env.CLAMAV_PORT }
      : undefined);
  if (clamav) {
    try {
      return await (opts.clamavScanner ?? scanWithClamAv)(
        data,
        clamav,
        opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      );
    } catch {
      return unavailable('clamav');
    }
  }

  try {
    const analysisId = await uploadToVirusTotal(data, opts.filename ?? 'upload.bin');
    if (!analysisId) return unavailable();

    return await pollVirusTotalAnalysis(
      analysisId,
      opts.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      opts.pollIntervalMs ?? DEFAULT_POLL_INTERVAL_MS,
    );
  } catch {
    return unavailable();
  }
}
