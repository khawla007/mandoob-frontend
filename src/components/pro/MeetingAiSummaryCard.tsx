import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { MeetingAiSummary } from '@/lib/data/meeting-ai-summaries';
import { retryMeetingSummaryAction } from '@/app/(tenant)/t/[tenant]/(pro)/meetings/actions';
import { getTranslations } from 'next-intl/server';

export async function MeetingAiSummaryCard({
  meetingId,
  slug,
  summary,
}: {
  meetingId: string;
  slug: string;
  summary: MeetingAiSummary | null;
}) {
  if (!summary) {
    return null;
  }

  const t = await getTranslations('meetingOperations.summary');

  const canRetry = summary.status === 'failed' || summary.status === 'completed';

  return (
    <div className="border-border bg-muted/20 mt-3 rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="font-medium">{t('title')}</span>
          <Badge variant={summary.status === 'completed' ? 'default' : 'secondary'}>
            {t(`statuses.${summary.status}`)}
          </Badge>
        </div>
        {canRetry ? (
          <form
            action={async () => {
              'use server';
              await retryMeetingSummaryAction(slug, meetingId);
            }}
          >
            <Button type="submit" size="sm" variant="ghost">
              {summary.status === 'completed' ? t('regenerate') : t('retry')}
            </Button>
          </form>
        ) : null}
      </div>

      {summary.summaryText ? <p className="mt-3 leading-6">{summary.summaryText}</p> : null}

      {summary.actionItems.length ? (
        <div className="mt-3 space-y-2">
          {summary.actionItems.map((item, index) => (
            <div
              key={`${item.title}-${index}`}
              className="border-border bg-background rounded border p-2"
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">{item.title}</span>
                <Badge variant="outline">{t(`priorities.${item.priority}`)}</Badge>
              </div>
              <div className="text-muted-foreground mt-1 text-xs">
                {item.owner_label ?? t('unassigned')}
                {item.due_date ? ` · ${item.due_date}` : ''}
              </div>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
