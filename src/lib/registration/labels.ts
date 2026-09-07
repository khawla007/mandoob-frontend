import {
  REGISTRATION_STAGE_CODES,
  REGISTRATION_STAGE_STATUSES,
  VISA_MILESTONE_CODES,
  VISA_PRESENTATION_STATUSES,
  type RegistrationStageCode,
  type RegistrationStageStatus,
  type VisaMilestoneCode,
  type VisaPresentationStatus,
} from './contracts';
import type { RegistrationWorkspaceLabels } from '@/components/registration/RegistrationWorkspace';

type Translator = (key: string) => string;

export function registrationWorkspaceLabels(t: Translator): RegistrationWorkspaceLabels {
  return {
    stagesTitle: t('workspace.stagesTitle'),
    stagesDescription: t('workspace.stagesDescription'),
    visaTitle: t('workspace.visaTitle'),
    visaDescription: t('workspace.visaDescription'),
    blockerTitle: t('workspace.blockerTitle'),
    nextActionTitle: t('workspace.nextActionTitle'),
    documentsTitle: t('workspace.documentsTitle'),
    historyTitle: t('workspace.historyTitle'),
    unavailable: t('states.unavailable'),
    unavailableDescription: t('states.unavailableDescription'),
    actionUnavailable: t('states.actionUnavailable'),
    empty: t('states.empty'),
    partial: t('states.partial'),
    noBlocker: t('states.noBlocker'),
    noNextAction: t('states.noNextAction'),
    noDocuments: t('states.noDocuments'),
    noVisaPeople: t('states.noVisaPeople'),
    noHistory: t('states.noHistory'),
    stageCount: t('workspace.stageCount'),
    stageLabels: Object.fromEntries(
      REGISTRATION_STAGE_CODES.map((code) => [code, t(`stages.${code}`)]),
    ) as Record<RegistrationStageCode, string>,
    stageStatuses: {
      ...Object.fromEntries(
        REGISTRATION_STAGE_STATUSES.map((status) => [status, t(`statuses.${status}`)]),
      ),
      unavailable: t('statuses.unavailable'),
    } as Record<RegistrationStageStatus | 'unavailable', string>,
    visaLabels: Object.fromEntries(
      VISA_MILESTONE_CODES.map((code) => [code, t(`visa.${code}`)]),
    ) as Record<VisaMilestoneCode, string>,
    visaStatuses: Object.fromEntries(
      VISA_PRESENTATION_STATUSES.map((status) => [status, t(`visaStatuses.${status}`)]),
    ) as Record<VisaPresentationStatus, string>,
  };
}
