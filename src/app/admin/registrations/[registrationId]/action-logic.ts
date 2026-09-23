import { ApiError } from '@/lib/errors';
import type {
  readOperatorRegistration,
  transitionStage,
  transitionVisaPerson,
  cancelVisaPerson,
  recoverUnlinkStageDocument,
  RegistrationActorContext,
} from '@/lib/data/registration-workflow';
import type {
  TransitionStageInput,
  TransitionVisaPersonInput,
  CancelVisaPersonInput,
  RecoverUnlinkStageDocumentInput,
} from '@/lib/validation/registration-workflow';

export type OperatorActionResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; code: string };

type OperatorSession = { id: string; role: 'admin' | 'super_admin'; aal: 'aal1' | 'aal2' };

// Operator mutations run against a specific registration. The registration's
// tenant + company are re-read from authoritative operator state (never trusted
// from the request) to build the actor context the mutation wrappers require.
export type OperatorRegistrationActionDependencies = {
  requireOperator(): Promise<OperatorSession>;
  readRegistration: typeof readOperatorRegistration;
  transitionStage: typeof transitionStage;
  transitionVisaPerson: typeof transitionVisaPerson;
  cancelVisaPerson: typeof cancelVisaPerson;
  recoverUnlinkStageDocument: typeof recoverUnlinkStageDocument;
  revalidate(path: string): void;
};

function errorResult(error: unknown, fallback: string): OperatorActionResult<never> {
  if (error instanceof ApiError) return { ok: false, error: error.message, code: error.code };
  console.error(fallback, error);
  return { ok: false, error: fallback, code: 'INTERNAL' };
}

// Guard: authenticate the operator and require AAL2. requirePlatformOperator in
// production already enforces MFA + AAL2, but the action re-asserts AAL2 as a
// fail-closed defense so a downgraded (AAL1) session can never mutate.
async function authorize(
  registrationId: string,
  dependencies: OperatorRegistrationActionDependencies,
): Promise<{ session: OperatorSession; actor: RegistrationActorContext & { actorAal: string } }> {
  const session = await dependencies.requireOperator();
  if (session.aal !== 'aal2') {
    throw new ApiError('MFA_REQUIRED', 'Step-up authentication required', 403);
  }
  const read = await dependencies.readRegistration(registrationId, {
    actorId: session.id,
    actorAal: session.aal,
  });
  return {
    session,
    actor: {
      actorId: session.id,
      tenantId: read.tenantId,
      companyId: read.companyId,
      actorAal: session.aal,
    },
  };
}

function revalidateDetail(
  dependencies: OperatorRegistrationActionDependencies,
  registrationId: string,
): void {
  dependencies.revalidate(`/admin/registrations/${registrationId}`);
  dependencies.revalidate('/admin/registrations');
}

async function run<T>(
  registrationId: string,
  dependencies: OperatorRegistrationActionDependencies,
  fallback: string,
  operation: (actor: RegistrationActorContext & { actorAal: string }) => Promise<T>,
): Promise<OperatorActionResult<T>> {
  // Authenticate outside the try so an auth/redirect throw is not swallowed.
  const { actor } = await authorize(registrationId, dependencies);
  try {
    const data = await operation(actor);
    revalidateDetail(dependencies, registrationId);
    return { ok: true, data };
  } catch (error) {
    return errorResult(error, fallback);
  }
}

export function runOperatorTransitionStageAction(
  registrationId: string,
  input: TransitionStageInput,
  dependencies: OperatorRegistrationActionDependencies,
) {
  return run(registrationId, dependencies, 'Could not transition stage', (actor) =>
    dependencies.transitionStage(input, actor),
  );
}

export function runOperatorTransitionVisaPersonAction(
  registrationId: string,
  input: TransitionVisaPersonInput,
  dependencies: OperatorRegistrationActionDependencies,
) {
  return run(registrationId, dependencies, 'Could not transition visa person', (actor) =>
    dependencies.transitionVisaPerson(input, actor),
  );
}

export function runOperatorCancelVisaPersonAction(
  registrationId: string,
  input: CancelVisaPersonInput,
  dependencies: OperatorRegistrationActionDependencies,
) {
  return run(registrationId, dependencies, 'Could not cancel visa person', (actor) =>
    dependencies.cancelVisaPerson(input, actor),
  );
}

export function runOperatorRecoverUnlinkStageDocumentAction(
  registrationId: string,
  input: RecoverUnlinkStageDocumentInput,
  dependencies: OperatorRegistrationActionDependencies,
) {
  return run(registrationId, dependencies, 'Could not recover document link', (actor) =>
    dependencies.recoverUnlinkStageDocument(input, actor),
  );
}
