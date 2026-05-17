import { Mail, MessageCircle, MessageSquare, Bell } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { CommChannel, CommRow } from '@/lib/data/comms';

const ICONS: Record<CommChannel, React.ComponentType<{ className?: string }>> = {
  email: Mail,
  whatsapp: MessageCircle,
  sms: MessageSquare,
  in_app: Bell,
};

function timeAgo(iso: string): string {
  const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  return `${days}d ago`;
}

export async function RecentCommsCard({ rows }: { rows: CommRow[] }) {
  const t = await getTranslations('customer');
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('recentComms')}</CardTitle>
        <CardDescription>{t('longCopy.recentCommsDescription')}</CardDescription>
      </CardHeader>
      <CardContent>
        {rows.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">{t('noRecentComms')}</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((c) => {
              const Icon = ICONS[c.channel];
              const fromPro = c.direction === 'out';
              const title = c.subject ?? c.preview;
              return (
                <li key={c.id} className="flex items-start gap-3 text-sm">
                  <div className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full">
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate font-medium">{title}</div>
                    <div className="text-muted-foreground text-xs">
                      {fromPro ? t('fromPro') : t('fromYou')} · {timeAgo(c.timestamp)}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
