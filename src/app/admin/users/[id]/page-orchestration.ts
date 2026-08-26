import 'server-only';

import type { ProCommercialTerm } from '@/lib/data/pro-commercial-terms';
import type { ProCredentialSnapshot } from '@/lib/data/pro-credentials';
import type { ProLifecycleIdentity } from '@/lib/data/pro-lifecycle-identity';
import type { ProLifecycleTimelinePage } from '@/lib/data/pro-lifecycle-timeline';

type PageDependencies = {
  identity(actorId: string, proProfileId: string): Promise<ProLifecycleIdentity>;
  credential(actorId: string, proProfileId: string): Promise<ProCredentialSnapshot>;
  terms(actorId: string, proProfileId: string): Promise<ProCommercialTerm[]>;
  timeline(
    actorId: string,
    proProfileId: string,
    limit: number,
    cursor: string | null,
  ): Promise<ProLifecycleTimelinePage>;
};

const defaults: PageDependencies = {
  identity: async (actorId, proProfileId) =>
    (await import('@/lib/data/pro-lifecycle-identity')).readProLifecycleIdentity(
      actorId,
      proProfileId,
    ),
  credential: async (actorId, proProfileId) =>
    (await import('@/lib/data/pro-credentials')).readProCredentialSnapshot(actorId, proProfileId),
  terms: async (actorId, proProfileId) =>
    (await import('@/lib/data/pro-commercial-terms')).readProCommercialTerms(actorId, proProfileId),
  timeline: async (actorId, proProfileId, limit, cursor) =>
    (await import('@/lib/data/pro-lifecycle-timeline')).readProLifecycleTimeline(
      actorId,
      proProfileId,
      limit,
      cursor,
    ),
};

export async function loadProLifecyclePage(
  actorId: string,
  proProfileId: string,
  timelineCursor: string | null,
  overrides: Partial<PageDependencies> = {},
) {
  const deps = { ...defaults, ...overrides };
  const identity = await deps.identity(actorId, proProfileId);
  const [credentialResult, termsResult, timelineResult] = await Promise.allSettled([
    deps.credential(actorId, proProfileId),
    deps.terms(actorId, proProfileId),
    deps.timeline(actorId, proProfileId, 25, timelineCursor),
  ]);

  return {
    identity,
    credentialState:
      credentialResult.status === 'fulfilled'
        ? { kind: 'ready' as const, ...credentialResult.value }
        : { kind: 'error' as const },
    termsState:
      termsResult.status === 'fulfilled'
        ? { kind: 'ready' as const, terms: termsResult.value }
        : { kind: 'error' as const },
    timelineState:
      timelineResult.status === 'fulfilled'
        ? { kind: 'ready' as const, timelinePage: timelineResult.value }
        : { kind: 'error' as const },
  };
}
