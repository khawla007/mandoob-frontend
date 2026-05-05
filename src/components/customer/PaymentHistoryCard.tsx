import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { PaymentHistory } from '@/lib/mocks/customer-portal';

export function PaymentHistoryCard({ data }: { data: PaymentHistory }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">Payments</CardTitle>
        <CardDescription>Pending invoices and recent receipts.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <section>
          <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
            Pending
          </h3>
          {data.pending.length === 0 ? (
            <p className="text-muted-foreground text-sm">No pending invoices.</p>
          ) : (
            <ul className="divide-border/60 divide-y">
              {data.pending.map((p) => (
                <li key={p.id} className="flex items-start justify-between gap-4 py-2 first:pt-0">
                  <div>
                    <div className="text-sm font-medium">{p.label}</div>
                    <div className="text-muted-foreground text-xs">Due {p.dueDate}</div>
                  </div>
                  <div className="text-sm font-semibold">{p.amount}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h3 className="text-muted-foreground mb-2 text-xs font-semibold tracking-wide uppercase">
            Recent
          </h3>
          {data.history.length === 0 ? (
            <p className="text-muted-foreground text-sm">No recent payments.</p>
          ) : (
            <ul className="divide-border/60 divide-y">
              {data.history.map((h) => (
                <li key={h.id} className="flex items-start justify-between gap-4 py-2 first:pt-0">
                  <div>
                    <div className="text-sm font-medium">{h.label}</div>
                    <div className="text-muted-foreground text-xs">Paid {h.paidAt}</div>
                  </div>
                  <div className="text-muted-foreground text-sm">{h.amount}</div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </CardContent>
    </Card>
  );
}
