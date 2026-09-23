'use server';

import { revalidatePath } from 'next/cache';
import { requirePlatformOperator } from '@/lib/auth/require-role';
import {
  cancelVisaPerson,
  readOperatorRegistration,
  recoverUnlinkStageDocument,
  transitionStage,
  transitionVisaPerson,
} from '@/lib/data/registration-workflow';
import type {
  CancelVisaPersonInput,
  RecoverUnlinkStageDocumentInput,
  TransitionStageInput,
  TransitionVisaPersonInput,
} from '@/lib/validation/registration-workflow';
import {
  runOperatorCancelVisaPersonAction,
  runOperatorRecoverUnlinkStageDocumentAction,
  runOperatorTransitionStageAction,
  runOperatorTransitionVisaPersonAction,
  type OperatorActionResult,
  type OperatorRegistrationActionDependencies,
} from './action-logic';

export type { OperatorActionResult } from './action-logic';

function dependencies(): OperatorRegistrationActionDependencies {
  return {
    requireOperator: async () => {
      // Enforces admin/super_admin + MFA + AAL2 (fail closed); redirects on any
      // shortfall. The action re-asserts AAL2 as defense in depth.
      const session = await requirePlatformOperator();
      const role = session.role === 'super_admin' ? 'super_admin' : 'admin';
      return { id: session.id, role, aal: session.aal };
    },
    readRegistration: readOperatorRegistration,
    transitionStage,
    transitionVisaPerson,
    cancelVisaPerson,
    recoverUnlinkStageDocument,
    revalidate: revalidatePath,
  };
}

export async function operatorTransitionStageAction(
  registrationId: string,
  input: TransitionStageInput,
): Promise<OperatorActionResult<Awaited<ReturnType<typeof transitionStage>>>> {
  return runOperatorTransitionStageAction(registrationId, input, dependencies());
}

export async function operatorTransitionVisaPersonAction(
  registrationId: string,
  input: TransitionVisaPersonInput,
): Promise<OperatorActionResult<Awaited<ReturnType<typeof transitionVisaPerson>>>> {
  return runOperatorTransitionVisaPersonAction(registrationId, input, dependencies());
}

export async function operatorCancelVisaPersonAction(
  registrationId: string,
  input: CancelVisaPersonInput,
): Promise<OperatorActionResult<Awaited<ReturnType<typeof cancelVisaPerson>>>> {
  return runOperatorCancelVisaPersonAction(registrationId, input, dependencies());
}

export async function operatorRecoverUnlinkStageDocumentAction(
  registrationId: string,
  input: RecoverUnlinkStageDocumentInput,
): Promise<OperatorActionResult<Awaited<ReturnType<typeof recoverUnlinkStageDocument>>>> {
  return runOperatorRecoverUnlinkStageDocumentAction(registrationId, input, dependencies());
}
