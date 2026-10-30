import { getTranslations } from 'next-intl/server';

import { QuestionnaireDefinitionEditor } from '@/components/admin/questionnaire/QuestionnaireDefinitionEditor';
import { DashboardPageHeader } from '@/components/shell/DashboardPageHeader';
import { requireRole } from '@/lib/auth/require-role';
import { getQuestionnaireDefinition } from '@/lib/questionnaire/definitions';
import {
  archiveQuestionnaireVersionAction,
  publishQuestionnaireVersionAction,
  saveQuestionnaireDraftAction,
} from './actions';

const DEFINITION_KEY = 'company-registration';

const STARTER_DEFINITION = {
  key: DEFINITION_KEY,
  version: 1,
  sections: [
    {
      id: 'applicant',
      title: 'Applicant',
      order: 1,
      fields: [
        { id: 'full_name', type: 'text', label: 'Full name', order: 1, required: true },
        { id: 'email', type: 'email', label: 'Email', order: 2, required: true },
        {
          id: 'consent',
          type: 'consent',
          label: 'I agree to the privacy policy',
          order: 3,
          required: true,
        },
      ],
    },
  ],
};

export default async function AdminQuestionnairePage() {
  const session = await requireRole('super_admin', 'admin');
  const t = await getTranslations('admin.management.questionnaire');

  if (session.aal !== 'aal2') {
    return (
      <div className="space-y-6">
        <DashboardPageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('intro')} />
        <p className="text-destructive text-sm">{t('editor.mfaRequired')}</p>
      </div>
    );
  }

  const summary = await getQuestionnaireDefinition(DEFINITION_KEY);
  const draftJson = JSON.stringify(summary?.draftDefinition ?? STARTER_DEFINITION, null, 2);

  return (
    <div className="admin-management-signal admin-operational-workspace space-y-6">
      <DashboardPageHeader
        eyebrow={t('eyebrow')}
        title={t('title')}
        description={t('editor.intro')}
        className="admin-operational-heading"
      />
      <QuestionnaireDefinitionEditor
        definitionKey={DEFINITION_KEY}
        definitionId={summary?.definitionId ?? null}
        title={summary?.title ?? 'Company registration'}
        rowVersion={summary?.rowVersion ?? 0}
        draftJson={draftJson}
        versions={(summary?.versions ?? []).map((version) => ({
          version: version.version,
          state: version.state,
          publishedAt: version.publishedAt,
        }))}
        saveAction={saveQuestionnaireDraftAction}
        publishAction={publishQuestionnaireVersionAction}
        archiveAction={archiveQuestionnaireVersionAction}
        labels={{
          key: t('editor.keyLabel'),
          title: t('editor.titleLabel'),
          definition: t('editor.definition'),
          preview: t('editor.preview'),
          save: t('editor.save'),
          publish: t('editor.publish'),
          archive: t('editor.archive'),
          versions: t('editor.versions'),
          invalidJson: t('editor.invalidJson'),
          savedHint: t('editor.savedHint'),
        }}
      />
    </div>
  );
}
