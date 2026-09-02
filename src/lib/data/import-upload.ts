export type BulkImportArtifactResult = 'created' | 'upload_failed' | 'job_insert_failed';

export async function uploadAndCreateBulkImportJob(input: {
  storagePath: string;
  upload: () => PromiseLike<{ error: unknown | null }>;
  createJob: () => PromiseLike<{ error: unknown | null }>;
  remove: (paths: string[]) => PromiseLike<{ error: unknown | null }>;
  logCleanupFailure: () => void;
}): Promise<BulkImportArtifactResult> {
  const upload = await input.upload();
  if (upload.error) return 'upload_failed';

  try {
    const job = await input.createJob();
    if (!job.error) return 'created';
  } catch {
    // The artifact was uploaded but no job owns it.
  }

  try {
    const cleanup = await input.remove([input.storagePath]);
    if (cleanup.error) input.logCleanupFailure();
  } catch {
    input.logCleanupFailure();
  }
  return 'job_insert_failed';
}
