import 'server-only';

import { createHash } from 'node:crypto';
import { ApiError } from '@/lib/errors';

const DEFAULT_MAX_BYTES = 500 * 1024 * 1024;

type IngestionInput = {
  recordingId: string;
  downloadUrl: string;
  storagePath: string;
  maxBytes?: number;
};

type RecordingMetadata = {
  recordingId: string;
  storagePath: string;
  mimeType: 'video/mp4';
  sizeBytes: number;
  sha256: string;
  scanProvider: string;
};

type IngestionDependencies = {
  fetchImpl: typeof fetch;
  scan(bytes: Uint8Array): Promise<{ clean: boolean; provider: string }>;
  upload(
    path: string,
    bytes: Uint8Array,
    metadata: { sha256: string; mimeType: string },
  ): Promise<void>;
  attach(metadata: RecordingMetadata): Promise<void>;
  remove?(path: string): Promise<void>;
};

async function readBounded(response: Response, maxBytes: number): Promise<Uint8Array> {
  const declared = Number(response.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw new ApiError('RECORDING_TOO_LARGE', 'Recording exceeds the configured limit.', 413);
  }
  if (!response.body)
    throw new ApiError('RECORDING_EMPTY', 'Recording bytes are unavailable.', 502);
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > maxBytes) {
      await reader.cancel();
      throw new ApiError('RECORDING_TOO_LARGE', 'Recording exceeds the configured limit.', 413);
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

function isMp4(bytes: Uint8Array): boolean {
  return bytes.byteLength >= 12 && String.fromCharCode(...bytes.slice(4, 8)) === 'ftyp';
}

export async function ingestDailyRecording(
  input: IngestionInput,
  dependencies: IngestionDependencies,
): Promise<RecordingMetadata> {
  const maxBytes = input.maxBytes ?? DEFAULT_MAX_BYTES;
  const response = await dependencies.fetchImpl(input.downloadUrl, {
    headers: { accept: 'video/mp4' },
    redirect: 'error',
  });
  if (!response.ok)
    throw new ApiError('RECORDING_DOWNLOAD_FAILED', 'Recording download failed.', 502);
  const contentType = response.headers.get('content-type')?.split(';', 1)[0]?.trim();
  if (contentType !== 'video/mp4') {
    throw new ApiError('RECORDING_MIME_INVALID', 'Recording type is not accepted.', 422);
  }
  const bytes = await readBounded(response, maxBytes);
  if (!isMp4(bytes)) {
    throw new ApiError('RECORDING_MAGIC_INVALID', 'Recording content is not a valid MP4.', 422);
  }
  const scan = await dependencies.scan(bytes);
  if (!scan.clean) throw new ApiError('RECORDING_MALWARE_BLOCKED', 'Recording was rejected.', 422);
  const metadata: RecordingMetadata = {
    recordingId: input.recordingId,
    storagePath: input.storagePath,
    mimeType: 'video/mp4',
    sizeBytes: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    scanProvider: scan.provider,
  };
  await dependencies.upload(input.storagePath, bytes, {
    sha256: metadata.sha256,
    mimeType: metadata.mimeType,
  });
  try {
    await dependencies.attach(metadata);
  } catch (error) {
    await dependencies.remove?.(input.storagePath).catch(() => undefined);
    throw error;
  }
  return metadata;
}
