import { ApiError } from '@/lib/errors';
import type {
  createRegistration,
  transitionStage,
  linkStageDocument,
  unlinkStageDocument,
  createVisaPerson,
  transitionVisaPerson,
  cancelVisaPerson,
  RegistrationActorContext,
} from '@/lib/data/registration-workflow';
import type {
  CreateRegistrationInput,
  TransitionStageInput,
  LinkStageDocumentInput,
  UnlinkStageDocumentInput,
  CreateVisaPersonInput,
  TransitionVisaPersonInput,
  CancelVisaPersonInput,
} from '@/lib/validation/registration-workflow';

export type RegistrationActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

type ProSession = { id: string; role: 'pro'; tenantId: string | null };
type TenantIdentity = { id: string };
type CompanyIdentity = { id: string; tenantId: string };

// The mutation wrappers are the authoritative boundary (Zod + payload hash +
// version checks + idempotency). This layer only derives the trusted actor
// context from the authenticated PRO assignment and forwards validated input.
export type RegistrationActionDependencies = {
  requirePro(slug: string): Promise<ProSession>;
  resolveTenant(slug: string): Promise<TenantIdentity | null>;
  requireActive(tenantId: string): Promise<unknown>;
  resolveAssignedCompany(profileId: string, slug: string): Promise<CompanyIdentity | null>;
  createRegistration: typeof createRegistration;
  transitionStage: typeof transitionStage;
  linkStageDocument: typeof linkStageDocument;
  unlinkStageDocument: typeof unlinkStageDocument;
  createVisaPerson: typeof createVisaPerson;
  transitionVisaPerson: typeof transitionVisaPerson;
  cancelVisaPerson: typeof cancelVisaPerson;
  revalidate(path: string): void;
};

function errorResult(error: unknown, fallback: string): RegistrationActionResult<never> {
  if (error instanceof ApiError) return { ok: false, error: error.message, code: error.code };
  console.error(fallback, error);
  return { ok: false, error: fallback, code: 'INTERNAL' };
}

type ProSessionIdentity = ProSession;

// Guard chain shared by every registration mutation. Fail closed: resolve
// tenant, reject a slug/session mismatch, require an active tenant, then require
// an active company assignment. Returns the trusted actor context. Runs inside
// the action try so authorization ApiErrors serialize to a result rather than
// throw (authentication happens earlier, outside the try).
async function authorize(
  slug: string,
  session: ProSessionIdentity,
  dependencies: RegistrationActionDependencies,
): Promise<RegistrationActorContext> {
  const tenant = await dependencies.resolveTenant(slug);
  if (!tenant) throw new ApiError('TENANT_NOT_FOUND', 'Tenant not found', 404);
  if (!session.tenantId || session.tenantId !== tenant.id) {
    throw new ApiError('FORBIDDEN', 'Cross-tenant access denied', 403);
  }
  await dependencies.requireActive(tenant.id);
  const company = await dependencies.resolveAssignedCompany(session.id, slug);
  if (!company || company.tenantId !== tenant.id) {
    throw new ApiError('FORBIDDEN', 'No active company assignment', 403);
  }
  return { actorId: session.id, tenantId: tenant.id, companyId: company.id };
}

function revalidateRegistration(dependencies: RegistrationActionDependencies, slug: string): void {
  dependencies.revalidate(`/t/${slug}/applications/registration`);
  dependencies.revalidate(`/t/${slug}/applications`);
  dependencies.revalidate(`/t/${slug}/dashboard`);
}

async function run<T>(
  slug: string,
  dependencies: RegistrationActionDependencies,
  fallback: string,
  operation: (actor: RegistrationActorContext) => Promise<T>,
): Promise<RegistrationActionResult<T>> {
  // Authenticate outside the try so an auth throw (redirect) is not swallowed.
  const session = await dependencies.requirePro(slug);
  try {
    const actor = await authorize(slug, session, dependencies);
    const data = await operation(actor);
    revalidateRegistration(dependencies, slug);
    return { ok: true, data };
  } catch (error) {
    return errorResult(error, fallback);
  }
}

export function runCreateRegistrationAction(
  slug: string,
  input: CreateRegistrationInput,
  dependencies: RegistrationActionDependencies,
) {
  return run(slug, dependencies, 'Could not create registration', (actor) =>
    // The wrapper re-derives companyId from the validated input and asserts it
    // against the trusted actor tenant; a spoofed companyId cannot widen scope.
    dependencies.createRegistration(input, actor),
  );
}

export function runTransitionStageAction(
  slug: string,
  input: TransitionStageInput,
  dependencies: RegistrationActionDependencies,
) {
  return run(slug, dependencies, 'Could not transition stage', (actor) =>
    dependencies.transitionStage(input, actor),
  );
}

export function runLinkStageDocumentAction(
  slug: string,
  input: LinkStageDocumentInput,
  dependencies: RegistrationActionDependencies,
) {
  return run(slug, dependencies, 'Could not link document', (actor) =>
    dependencies.linkStageDocument(input, actor),
  );
}

export function runUnlinkStageDocumentAction(
  slug: string,
  input: UnlinkStageDocumentInput,
  dependencies: RegistrationActionDependencies,
) {
  return run(slug, dependencies, 'Could not unlink document', (actor) =>
    dependencies.unlinkStageDocument(input, actor),
  );
}

export function runCreateVisaPersonAction(
  slug: string,
  input: CreateVisaPersonInput,
  dependencies: RegistrationActionDependencies,
) {
  return run(slug, dependencies, 'Could not add visa person', (actor) =>
    dependencies.createVisaPerson(input, actor),
  );
}

export function runTransitionVisaPersonAction(
  slug: string,
  input: TransitionVisaPersonInput,
  dependencies: RegistrationActionDependencies,
) {
  return run(slug, dependencies, 'Could not transition visa person', (actor) =>
    dependencies.transitionVisaPerson(input, actor),
  );
}

export function runCancelVisaPersonAction(
  slug: string,
  input: CancelVisaPersonInput,
  dependencies: RegistrationActionDependencies,
) {
  return run(slug, dependencies, 'Could not cancel visa person', (actor) =>
    dependencies.cancelVisaPerson(input, actor),
  );
}
