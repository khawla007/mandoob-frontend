import { isNormalizedOwnedStoragePath } from '@/lib/storage/owned-path';

export type ErasureCleanupJob = {
  requestId: string;
  tenantId: string;
  companyId: string;
  subjectUserId: string;
  storagePaths: string[];
  storageDeleted: boolean;
  authAnonymized: boolean;
  notificationQueued: boolean;
};

export type ErasureCleanupDependencies = {
  deleteStorage(paths: string[]): Promise<void>;
  anonymizeAuth(subjectUserId: string, requestId: string): Promise<void>;
  markStep(step: 'storage' | 'auth' | 'notification'): Promise<void>;
  complete(): Promise<void>;
  notify(): Promise<void>;
};

export async function runErasureExternalCleanup(
  job: ErasureCleanupJob,
  dependencies: ErasureCleanupDependencies,
): Promise<void> {
  const invalidPath = job.storagePaths.find(
    (path) => !isNormalizedOwnedStoragePath(path, job.tenantId, job.companyId),
  );
  if (invalidPath) throw new Error('invalid erasure storage path');

  if (!job.storageDeleted) {
    await dependencies.deleteStorage(job.storagePaths);
    await dependencies.markStep('storage');
  }
  if (!job.authAnonymized) {
    await dependencies.anonymizeAuth(job.subjectUserId, job.requestId);
    await dependencies.markStep('auth');
  }
  await dependencies.complete();
  if (!job.notificationQueued) {
    await dependencies.notify();
    await dependencies.markStep('notification');
  }
}
