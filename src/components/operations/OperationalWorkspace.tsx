import { randomUUID } from 'node:crypto';

import Link from 'next/link';
import { revalidatePath } from 'next/cache';
import { getLocale, getTranslations } from 'next-intl/server';

import { DashboardPageHeader } from '@/components/shell/DashboardPageHeader';
import { DashboardRouteState } from '@/components/shell/DashboardRouteStates';
import {
  OperationalNotificationReadForm,
  type OperationalNotificationReadActionState,
} from '@/components/operations/OperationalNotificationReadForm';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  loadOperationalWorkspace,
  setOperationalNotificationReadState,
  type OperationalRuntimeItem,
  type OperationalRuntimeModule,
  type OperationalRuntimeRole,
  type OperationalSearch,
} from '@/lib/operations/runtime';

type OperationalWorkspaceProps = {
  role: OperationalRuntimeRole;
  module: OperationalRuntimeModule;
  baseHref: string;
  tenantSlug?: string;
  search?: OperationalSearch;
};

function one(value: string | string[] | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function dateTime(value: string, locale: string): string {
  return new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Dubai',
  }).format(new Date(value));
}

function operationalCodeLabel(
  code: string,
  t: Awaited<ReturnType<typeof getTranslations<'operations'>>>,
): string {
  switch (code) {
    case 'EMPLOYEE_RECORD_CHANGED':
      return t('runtime.codes.employeeRecordChanged');
    case 'EMPLOYEE_IMPORT_FINISHED':
      return t('runtime.codes.employeeImportFinished');
    case 'RENEWAL_LIFECYCLE_CHANGED':
      return t('runtime.codes.renewalLifecycleChanged');
    case 'RENEWAL_REMINDER_SCHEDULED':
      return t('runtime.codes.renewalReminderScheduled');
    case 'RENEWAL_ATTENTION_DAILY':
      return t('runtime.codes.renewalAttentionDaily');
    case 'MEETING_BOOKED':
      return t('runtime.codes.meetingBooked');
    case 'MEETING_RESCHEDULED':
      return t('runtime.codes.meetingRescheduled');
    case 'MEETING_CANCELLED':
      return t('runtime.codes.meetingCancelled');
    default:
      return t('runtime.codes.other');
  }
}

export async function OperationalWorkspace({
  role,
  module,
  baseHref,
  tenantSlug,
  search = {},
}: OperationalWorkspaceProps) {
  const requestedCompanyId = one(search.companyId);
  const [model, locale, t] = await Promise.all([
    loadOperationalWorkspace({
      role,
      module,
      baseHref,
      tenantSlug,
      requestedCompanyId,
      search,
    }),
    getLocale(),
    getTranslations('operations'),
  ]);

  async function setReadState(
    _previousState: OperationalNotificationReadActionState,
    formData: FormData,
  ): Promise<OperationalNotificationReadActionState> {
    'use server';

    const notificationId = formData.get('notificationId');
    const operationId = formData.get('operationId');
    const read = formData.get('read');
    if (
      typeof notificationId !== 'string' ||
      typeof operationId !== 'string' ||
      (read !== 'true' && read !== 'false')
    ) {
      return { status: 'error' };
    }
    const result = await setOperationalNotificationReadState({
      role,
      tenantSlug,
      requestedCompanyId,
      notificationId,
      operationId,
      read: read === 'true',
    });
    if (!result.ok) return { status: 'error' };
    revalidatePath(baseHref);
    return { status: 'success' };
  }

  const title = t(`modules.${module}.title`);
  const description = t(`modules.${module}.description`, { scope: t(`roles.${role}`) });

  return (
    <div className="signal-dashboard min-w-0 space-y-5">
      <DashboardPageHeader
        eyebrow={t('eyebrow', { scope: t(`roles.${role}`) })}
        title={title}
        description={description}
      />

      <Card className="signal-panel min-w-0" size="sm">
        <CardContent className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="text-muted-foreground text-sm">{t('runtime.channels.label')}</span>
          <Badge variant="outline">{t('runtime.channels.disabled')}</Badge>
          <span className="text-muted-foreground text-sm">{t('runtime.channels.description')}</span>
        </CardContent>
      </Card>

      {model.state === 'scope-required' ? (
        <DashboardRouteState
          state="unavailable"
          variant="panel"
          title={t('runtime.scopeRequired.title')}
          description={t('runtime.scopeRequired.description')}
          action={
            <Button asChild variant="outline">
              <Link href="/admin/companies">{t('runtime.scopeRequired.action')}</Link>
            </Button>
          }
        />
      ) : model.state === 'unavailable' ? (
        <DashboardRouteState
          state="unavailable"
          variant="panel"
          title={t('runtime.communications.title')}
          description={t('runtime.communications.description')}
        />
      ) : model.state === 'error' ? (
        <DashboardRouteState
          state="error"
          variant="panel"
          title={t('runtime.error.title')}
          safeDescription={t('runtime.error.description')}
          safeHref={model.retryHref}
          safeHrefLabel={t('runtime.error.retry')}
        />
      ) : model.state === 'empty' ? (
        <DashboardRouteState
          state="empty"
          variant="panel"
          title={t('runtime.empty.title')}
          description={t(`runtime.empty.${module}`)}
        />
      ) : (
        <section className="min-w-0 space-y-3" aria-label={t('runtime.listLabel')}>
          <ul className="grid min-w-0 gap-3">
            {model.items.map((item) => (
              <li key={item.id} className="min-w-0">
                <OperationalItem item={item} locale={locale} setReadState={setReadState} t={t} />
              </li>
            ))}
          </ul>
          {model.nextHref ? (
            <Button asChild variant="outline">
              <Link href={model.nextHref}>{t('runtime.next')}</Link>
            </Button>
          ) : null}
        </section>
      )}
    </div>
  );
}

function OperationalItem({
  item,
  locale,
  setReadState,
  t,
}: {
  item: OperationalRuntimeItem;
  locale: string;
  setReadState: (
    previousState: OperationalNotificationReadActionState,
    formData: FormData,
  ) => Promise<OperationalNotificationReadActionState>;
  t: Awaited<ReturnType<typeof getTranslations<'operations'>>>;
}) {
  return (
    <Card className="signal-panel min-w-0" size="sm">
      <CardHeader className="border-b">
        <CardTitle className="break-words">{operationalCodeLabel(item.code, t)}</CardTitle>
      </CardHeader>
      <CardContent className="flex min-w-0 flex-wrap items-center gap-2">
        {item.kind === 'notification' ? (
          <>
            <Badge variant={item.severity === 'critical' ? 'destructive' : 'secondary'}>
              {t(`runtime.severity.${item.severity}`)}
            </Badge>
            <Badge variant="outline">
              {t(item.read ? 'runtime.readState.read' : 'runtime.readState.unread')}
            </Badge>
            {item.canSetReadState ? (
              <OperationalNotificationReadForm
                action={setReadState}
                notificationId={item.id}
                operationId={randomUUID()}
                read={item.read}
                actionLabel={t(
                  item.read ? 'runtime.actions.markUnread' : 'runtime.actions.markRead',
                )}
                pendingLabel={t('runtime.actions.pending')}
                successLabel={t('runtime.actions.success')}
                errorLabel={t('runtime.actions.error')}
              />
            ) : null}
          </>
        ) : item.kind === 'task' ? (
          <>
            <Badge variant={item.priority === 'urgent' ? 'destructive' : 'secondary'}>
              {t(`runtime.priority.${item.priority}`)}
            </Badge>
            <Badge variant="outline">{t(`runtime.taskState.${item.state}`)}</Badge>
            {item.dueAt ? (
              <span className="text-muted-foreground text-sm">
                {t('runtime.dueAt', { value: dateTime(item.dueAt, locale) })}
              </span>
            ) : null}
          </>
        ) : null}
        <time className="text-muted-foreground text-sm" dateTime={item.createdAt}>
          {dateTime(item.createdAt, locale)}
        </time>
      </CardContent>
    </Card>
  );
}
