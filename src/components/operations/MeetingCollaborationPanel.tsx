import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import type { MeetingCollaboration } from '@/lib/data/meeting-collaboration';

export function MeetingCollaborationPanel({
  state,
  canReview,
  canAddNote,
  labels,
  setConsent,
  addNote,
  reviewAction,
}: {
  state: MeetingCollaboration;
  canReview: boolean;
  canAddNote: boolean;
  labels: Record<string, string>;
  setConsent(granted: boolean): Promise<void>;
  addNote?(formData: FormData): Promise<void>;
  reviewAction?(actionItemId: string, decision: 'accepted' | 'dismissed'): Promise<void>;
}) {
  return (
    <div className="border-border bg-muted/20 mt-3 space-y-3 rounded-md border p-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="font-medium">{labels.consentTitle}</p>
          <p className="text-muted-foreground text-xs">{labels.consentDescription}</p>
        </div>
        <Badge variant={state.consentGranted ? 'default' : 'secondary'}>
          {state.consentGranted ? labels.consentGranted : labels.consentRequired}
        </Badge>
      </div>
      <div className="flex flex-wrap gap-2">
        <form
          action={async () => {
            'use server';
            await setConsent(true);
          }}
        >
          <Button type="submit" size="sm">
            {labels.grantConsent}
          </Button>
        </form>
        {state.consentGranted ? (
          <form
            action={async () => {
              'use server';
              await setConsent(false);
            }}
          >
            <Button type="submit" size="sm" variant="outline">
              {labels.withdrawConsent}
            </Button>
          </form>
        ) : null}
      </div>
      {canAddNote && addNote ? (
        <form action={addNote} className="flex flex-col gap-2 sm:flex-row">
          <Input name="body" maxLength={10000} required placeholder={labels.notePlaceholder} />
          <Button type="submit" size="sm">
            {labels.addNote}
          </Button>
        </form>
      ) : null}
      {state.notes.length ? (
        <div className="space-y-2">
          <p className="font-medium">{labels.notes}</p>
          {state.notes.map((note) => (
            <p key={note.id} className="rounded border p-2">
              {note.body}
            </p>
          ))}
        </div>
      ) : null}
      {state.actions.length ? (
        <div className="space-y-2">
          <p className="font-medium">{labels.actions}</p>
          {state.actions.map((item) => (
            <div
              key={item.id}
              className="flex flex-wrap items-center justify-between gap-2 rounded border p-2"
            >
              <div>
                <span>{item.title}</span>{' '}
                <Badge variant="outline">{labels[`state_${item.state}`]}</Badge>
              </div>
              {canReview && item.state === 'proposed' && reviewAction ? (
                <div className="flex gap-2">
                  <form
                    action={async () => {
                      'use server';
                      await reviewAction(item.id, 'accepted');
                    }}
                  >
                    <Button type="submit" size="sm">
                      {labels.accept}
                    </Button>
                  </form>
                  <form
                    action={async () => {
                      'use server';
                      await reviewAction(item.id, 'dismissed');
                    }}
                  >
                    <Button type="submit" size="sm" variant="outline">
                      {labels.dismiss}
                    </Button>
                  </form>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
