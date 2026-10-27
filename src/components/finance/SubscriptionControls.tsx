import { Button } from '@/components/ui/button';
import { formatMoney } from '@/lib/format/money';
import type { BillingPlanOption } from '@/lib/data/tenant-billing';

type SubscriptionControlLabels = {
  providerUnavailable: string;
  checkout: string;
  portal: string;
  cancel: string;
  change: string;
  monthly: string;
  annual: string;
  starter: string;
  professional: string;
  enterprise: string;
};

export function SubscriptionControls({
  providerAvailable,
  labels,
  purchaseAction,
  portalAction,
  cancelAction,
  tenantSlug,
  catalogVersionId,
  options,
  subscriptionVersion,
  operationIds,
  locale,
}: {
  providerAvailable: boolean;
  labels: SubscriptionControlLabels;
  purchaseAction: (formData: FormData) => void | Promise<void>;
  portalAction: (formData: FormData) => void | Promise<void>;
  cancelAction: (formData: FormData) => void | Promise<void>;
  tenantSlug: string;
  catalogVersionId: string | null;
  options: BillingPlanOption[];
  subscriptionVersion: number | null;
  operationIds: string[];
  locale: string;
}) {
  if (!providerAvailable) {
    return (
      <p className="text-signal-urgent text-sm" role="status">
        {labels.providerUnavailable}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {options.map((option, index) => (
          <form
            action={purchaseAction}
            className="border-border rounded-lg border p-3"
            key={`${option.plan}:${option.cadence}`}
          >
            <input type="hidden" name="tenantSlug" value={tenantSlug} />
            <input type="hidden" name="operationId" value={operationIds[index]} />
            <input type="hidden" name="catalogVersionId" value={catalogVersionId ?? ''} />
            <input type="hidden" name="plan" value={option.plan} />
            <input type="hidden" name="cadence" value={option.cadence} />
            {subscriptionVersion !== null ? (
              <input type="hidden" name="expectedVersion" value={subscriptionVersion} />
            ) : null}
            <p className="font-medium">{labels[option.plan]}</p>
            <p className="text-muted-foreground mb-3 text-sm">
              {formatMoney(option.amountMinor, option.currency, locale)} / {labels[option.cadence]}
            </p>
            <Button className="min-h-11 w-full" type="submit">
              {subscriptionVersion === null ? labels.checkout : labels.change}
            </Button>
          </form>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        {subscriptionVersion !== null ? (
          <>
            <form action={portalAction}>
              <input type="hidden" name="tenantSlug" value={tenantSlug} />
              <input type="hidden" name="operationId" value={operationIds[options.length]} />
              <Button className="min-h-11" type="submit" variant="outline">
                {labels.portal}
              </Button>
            </form>
            <form action={cancelAction}>
              <input type="hidden" name="tenantSlug" value={tenantSlug} />
              <input type="hidden" name="operationId" value={operationIds[options.length + 1]} />
              <input type="hidden" name="expectedVersion" value={subscriptionVersion} />
              <Button className="min-h-11" type="submit" variant="outline">
                {labels.cancel}
              </Button>
            </form>
          </>
        ) : null}
      </div>
    </div>
  );
}
