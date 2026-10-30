import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export function MeetingScheduleControls({
  rescheduleLabel,
  cancelLabel,
  startLabel,
  durationLabel,
  reschedule,
  cancel,
}: {
  rescheduleLabel: string;
  cancelLabel: string;
  startLabel: string;
  durationLabel: string;
  reschedule(formData: FormData): Promise<void>;
  cancel(): Promise<void>;
}) {
  return (
    <div className="flex flex-wrap items-end gap-2">
      <form action={reschedule} className="flex flex-wrap items-end gap-2">
        <label className="text-muted-foreground grid gap-1 text-xs">
          {startLabel}
          <Input name="starts_at" type="datetime-local" required className="h-9 w-48" />
        </label>
        <label className="text-muted-foreground grid gap-1 text-xs">
          {durationLabel}
          <Input
            name="duration_minutes"
            type="number"
            min="15"
            max="180"
            defaultValue="30"
            required
            className="h-9 w-24"
          />
        </label>
        <Button type="submit" size="sm" variant="outline">
          {rescheduleLabel}
        </Button>
      </form>
      <form action={cancel}>
        <Button type="submit" size="sm" variant="ghost">
          {cancelLabel}
        </Button>
      </form>
    </div>
  );
}
