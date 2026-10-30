import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { RenewalCalendarMonth } from '@/lib/renewals/dubai-calendar';
import type {
  EmployeeActivityItem,
  EmployeeCalendarRenewal,
  EmployeeTask,
} from '@/lib/employees/self-service';

type T = (key: string, values?: Record<string, string | number>) => string;

export function EmployeeRenewalCalendar({
  month,
  t,
  locale,
  previousHref,
  nextHref,
}: {
  month: RenewalCalendarMonth<EmployeeCalendarRenewal>;
  t: T;
  locale: string;
  previousHref: string;
  nextHref: string;
}) {
  const title = new Intl.DateTimeFormat(locale, {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${month.month}-01T00:00:00Z`));
  const busy = month.days.filter((day) => day.items.length > 0);
  return (
    <Card className="signal-panel">
      <CardHeader>
        <CardTitle>{t('calendarTitle', { month: title })}</CardTitle>
        <CardDescription>{t('calendarDescription')}</CardDescription>
        <nav className="flex gap-3 text-sm" aria-label={t('calendarNav')}>
          <a className="text-primary font-semibold" href={previousHref}>
            {t('previousMonth')}
          </a>
          <a className="text-primary font-semibold" href={nextHref}>
            {t('nextMonth')}
          </a>
        </nav>
      </CardHeader>
      <CardContent>
        {busy.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('calendarEmpty')}</p>
        ) : (
          <ol className="space-y-3">
            {busy.map((day) => (
              <li key={day.date} className="rounded-md border p-3">
                <p className="text-sm font-semibold" dir="ltr">
                  {day.date}
                </p>
                <ul className="mt-2 space-y-1">
                  {day.items.map((item) => (
                    <li key={item.id} className="flex flex-wrap items-center gap-2 text-sm">
                      <span>{item.label}</span>
                      <Badge variant={item.urgency === 'overdue' ? 'destructive' : 'secondary'}>
                        {t(`urgency.${item.urgency}`)}
                      </Badge>
                      <Badge variant="outline">{t(`stages.${item.stage}`)}</Badge>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export function EmployeeActivityList({
  items,
  t,
  locale,
}: {
  items: EmployeeActivityItem[];
  t: T;
  locale: string;
}) {
  const format = new Intl.DateTimeFormat(locale, {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Dubai',
  });
  return (
    <Card className="signal-panel">
      <CardHeader>
        <CardTitle>{t('activityTitle')}</CardTitle>
        <CardDescription>{t('activityDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('activityEmpty')}</p>
        ) : (
          <ol className="space-y-2">
            {items.map((item) => (
              <li key={`${item.source}:${item.id}`} className="flex flex-wrap gap-2 text-sm">
                <span className="text-muted-foreground">{format.format(new Date(item.at))}</span>
                <span className="font-medium">{t(`activity.${item.source}.${item.action}`)}</span>
                {item.stage ? <Badge variant="outline">{t(`stages.${item.stage}`)}</Badge> : null}
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

export function EmployeeTaskList({ tasks, t }: { tasks: EmployeeTask[]; t: T }) {
  return (
    <Card className="signal-panel">
      <CardHeader>
        <CardTitle>{t('tasksTitle')}</CardTitle>
        <CardDescription>{t('tasksDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        {tasks.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t('tasksEmpty')}</p>
        ) : (
          <ul className="space-y-2">
            {tasks.map((task) => (
              <li
                key={`${task.kind}:${task.id}`}
                className="flex flex-wrap items-center gap-2 text-sm"
              >
                <Badge variant="outline">{t(`taskKinds.${task.kind}`)}</Badge>
                <span className="font-medium">{task.label}</span>
                {task.kind === 'renewal' ? (
                  <Badge variant={task.urgency === 'overdue' ? 'destructive' : 'secondary'}>
                    {t(`urgency.${task.urgency}`)} · <span dir="ltr">{task.dueDate}</span>
                  </Badge>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
