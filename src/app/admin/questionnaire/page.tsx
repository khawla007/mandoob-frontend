import { getTranslations } from 'next-intl/server';

import { QuestionnaireBuilderUnavailable } from '@/components/admin/management/QuestionnaireBuilderUnavailable';
import { DashboardPageHeader } from '@/components/shell/DashboardPageHeader';
import { requirePlatformOperator } from '@/lib/auth/require-role';

export default async function AdminQuestionnairePage() {
  await requirePlatformOperator();
  const t = await getTranslations('admin.management.questionnaire');
  return (
    <div className="space-y-6">
      <DashboardPageHeader eyebrow={t('eyebrow')} title={t('title')} description={t('intro')} />
      <QuestionnaireBuilderUnavailable
        labels={{
          sections: t('sections'),
          sectionsDescription: t('sectionsDescription'),
          questionEditor: t('questionEditor'),
          editorDescription: t('editorDescription'),
          questionType: t('fields.questionType'),
          label: t('fields.label'),
          help: t('fields.help'),
          required: t('fields.required'),
          options: t('fields.options'),
          validation: t('fields.validation'),
          conditional: t('fields.conditional'),
          consent: t('fields.consent'),
          dirty: t('states.dirty'),
          validating: t('states.validating'),
          pending: t('states.pending'),
          success: t('states.success'),
          conflict: t('states.conflict'),
          unavailable: t('states.unavailable'),
          error: t('states.error'),
          add: t('actions.add'),
          reorder: t('actions.reorder'),
          edit: t('actions.edit'),
          duplicate: t('actions.duplicate'),
          archive: t('actions.archive'),
          preview: t('actions.preview'),
          publish: t('actions.publish'),
          actionExplanation: t('actionExplanation'),
        }}
      />
    </div>
  );
}
