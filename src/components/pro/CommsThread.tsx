'use client';

import { useMemo, useState, useTransition } from 'react';
import { Mail, MessageCircle, MessageSquare, Bell } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { CommChannel, CommRow } from '@/lib/data/comms';

const ICONS: Record<CommChannel, React.ComponentType<{ className?: string }>> = {
  email: Mail,
  whatsapp: MessageCircle,
  sms: MessageSquare,
  in_app: Bell,
};

const CHANNELS: Array<{ key: CommChannel | 'all'; label: string }> = [
  { key: 'all', label: 'All' },
  { key: 'email', label: 'Email' },
  { key: 'whatsapp', label: 'WhatsApp' },
  { key: 'sms', label: 'SMS' },
];

export type CommsThreadProps = {
  initialRows: CommRow[];
  loadOlder: (beforeIso: string) => Promise<CommRow[]>;
  pageSize?: number;
};

export function CommsThread({ initialRows, loadOlder, pageSize = 25 }: CommsThreadProps) {
  const [rows, setRows] = useState<CommRow[]>(initialRows);
  const [filter, setFilter] = useState<CommChannel | 'all'>('all');
  const [hasMore, setHasMore] = useState<boolean>(initialRows.length >= pageSize);
  const [pending, startTransition] = useTransition();

  const visible = useMemo(
    () => (filter === 'all' ? rows : rows.filter((r) => r.channel === filter)),
    [rows, filter],
  );

  function onLoadOlder() {
    const oldest = rows[rows.length - 1];
    if (!oldest) return;
    startTransition(async () => {
      const older = await loadOlder(oldest.timestamp);
      if (older.length === 0) {
        setHasMore(false);
        return;
      }
      const seen = new Set(rows.map((r) => r.id));
      const merged = [...rows, ...older.filter((r) => !seen.has(r.id))];
      setRows(merged);
      if (older.length < pageSize) setHasMore(false);
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Communications</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {CHANNELS.map((c) => (
            <Button
              key={c.key}
              variant={filter === c.key ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(c.key)}
            >
              {c.label}
            </Button>
          ))}
        </div>

        {visible.length === 0 ? (
          <p className="text-muted-foreground py-6 text-center text-sm">No communications yet.</p>
        ) : (
          <ul className="divide-border divide-y">
            {visible.map((r) => {
              const Icon = ICONS[r.channel];
              return (
                <li key={r.id} className="flex items-start gap-3 py-3 text-sm">
                  <div className="bg-muted text-muted-foreground flex size-8 shrink-0 items-center justify-center rounded-full">
                    <Icon className="size-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <div className="truncate font-medium">{r.subject ?? r.preview}</div>
                      <span className="text-muted-foreground text-xs whitespace-nowrap">
                        {new Date(r.timestamp).toLocaleString()}
                      </span>
                    </div>
                    {r.subject && r.preview ? (
                      <div className="text-muted-foreground truncate text-xs">{r.preview}</div>
                    ) : null}
                    <div className="mt-1 flex items-center gap-2 text-xs">
                      <Badge variant="secondary">{r.channel}</Badge>
                      <Badge variant="outline">
                        {r.direction === 'in' ? 'Inbound' : 'Outbound'}
                      </Badge>
                      <Badge variant="outline">{r.status}</Badge>
                      <span className="text-muted-foreground truncate">{r.recipient}</span>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}

        {hasMore ? (
          <div className="flex justify-center">
            <Button variant="outline" size="sm" onClick={onLoadOlder} disabled={pending}>
              {pending ? 'Loading…' : 'Load older'}
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}
