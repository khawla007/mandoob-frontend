import { getTranslations, setRequestLocale } from 'next-intl/server';
import { Link } from '@/i18n/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatMoney } from '@/lib/format/money';

const TIER_KEYS = ['starter', 'professional', 'enterprise'] as const;
type TierKey = (typeof TIER_KEYS)[number];

const TIER_PRICES: Record<TierKey, number> = {
  starter: 4900,
  professional: 9900,
  enterprise: 19900,
};

interface PageProps {
  params: Promise<{ locale: string }>;
}

export default async function PricingPage({ params }: PageProps) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'pricing' });

  return (
    <section className="mx-auto max-w-6xl px-6 py-16">
      <div className="max-w-2xl">
        <h1 className="text-4xl font-semibold tracking-tight">{t('title')}</h1>
        <p className="text-muted-foreground mt-4">{t('subtitle')}</p>
      </div>
      <div className="mt-8 grid gap-4 lg:grid-cols-3">
        {TIER_KEYS.map((key) => {
          const features = t.raw(`tiers.${key}.features`) as string[];
          return (
            <Card key={key}>
              <CardHeader>
                <CardTitle>{t(`tiers.${key}.name`)}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-5">
                <div>
                  <span className="text-3xl font-semibold">
                    {formatMoney(TIER_PRICES[key], 'USD')}
                  </span>
                  <span className="text-muted-foreground text-sm"> {t('perMonth')}</span>
                </div>
                <ul className="text-muted-foreground space-y-2 text-sm">
                  {features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <Button asChild className="w-full">
                  <Link href="/register/pro">{t('getStarted')}</Link>
                </Button>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
