import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type AllocationLabels = {
  amount: string;
  operation: string;
  submit: string;
};

export function AllocationForm({
  action,
  invoiceId,
  expectedVersion,
  operationId,
  maxAmountMinor,
  labels,
}: {
  action: (formData: FormData) => void | Promise<void>;
  invoiceId: string;
  expectedVersion: number;
  operationId: string;
  maxAmountMinor: number;
  labels: AllocationLabels;
}) {
  return (
    <form action={action} className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
      <input type="hidden" name="invoiceId" value={invoiceId} />
      <input type="hidden" name="expectedVersion" value={expectedVersion} />
      <input type="hidden" name="operationId" value={operationId} />
      <div className="grid gap-2">
        <Label htmlFor={`allocation-${invoiceId}`}>{labels.amount}</Label>
        <Input
          id={`allocation-${invoiceId}`}
          name="amountMinor"
          inputMode="numeric"
          min={1}
          max={maxAmountMinor}
          required
          aria-describedby={`allocation-operation-${invoiceId}`}
        />
        <p id={`allocation-operation-${invoiceId}`} className="text-muted-foreground text-xs">
          {labels.operation}
        </p>
      </div>
      <Button className="min-h-11" type="submit">
        {labels.submit}
      </Button>
    </form>
  );
}
