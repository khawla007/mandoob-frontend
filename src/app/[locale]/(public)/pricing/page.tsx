import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMoney } from '@/lib/format/money';

const plans = [
  {
    name: 'Starter',
    price: 4900,
    features: ['Client records', 'Document requests', 'Renewal alerts'],
  },
  {
    name: 'Professional',
    price: 9900,
    features: ['Payments', 'WhatsApp + SMS', 'Audit exports'],
  },
  {
    name: 'Enterprise',
    price: 19900,
    features: ['Scale limits', 'Advanced controls', 'Priority support'],
  },
];

export default function PricingPage() {
  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <div className="max-w-2xl">
        <h1 className="text-4xl font-semibold tracking-tight">Mandoob pricing</h1>
        <p className="text-muted-foreground mt-4">
          Subscription plans for UAE PRO firms running client onboarding, renewals, documents, and
          payment operations.
        </p>
      </div>
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        {plans.map((plan) => (
          <Card key={plan.name}>
            <CardHeader>
              <CardTitle>{plan.name}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <div>
                <span className="text-3xl font-semibold">{formatMoney(plan.price, 'USD')}</span>
                <span className="text-muted-foreground text-sm"> / month</span>
              </div>
              <ul className="text-muted-foreground space-y-2 text-sm">
                {plan.features.map((feature) => (
                  <li key={feature}>{feature}</li>
                ))}
              </ul>
              <Button asChild className="w-full">
                <Link href="/register/pro">Get started</Link>
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </section>
  );
}
