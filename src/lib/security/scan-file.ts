import 'server-only';
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
};

const VIRUSTOTAL_API_BASE = 'https://www.virustotal.com/api/v3';
const DEFAULT_TIMEOUT_MS = 15_000;
const DEFAULT_POLL_INTERVAL_MS = 1_000;
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
    const response = await fetch(`${VIRUSTOTAL_API_BASE}/analyses/${encodeURIComponent(analysisId)}`, {
      headers: { 'x-apikey': env.VIRUSTOTAL_API_KEY },
    });
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
