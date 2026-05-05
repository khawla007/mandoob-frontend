import 'server-only';

export type FileScanResult = {
  clean: boolean;
  reason?: string;
};

// Stub implementation. The real ClamAV / cloud scanner integration is a
// follow-up sub-project; this lets the upload pipeline call the same
// interface today and the scan can be swapped in without touching callers.
//
// TODO(step-future): integrate ClamAV daemon or cloud scanner.
export async function scanFile(buf: ArrayBuffer | Uint8Array): Promise<FileScanResult> {
  void buf;
  return { clean: true };
}
