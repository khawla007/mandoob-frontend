import { getTranslations, setRequestLocale } from 'next-intl/server';

type Params = { locale: string; slug: string };

export default async function LegalPage({ params }: { params: Promise<Params> }) {
  const { locale, slug } = await params;
  setRequestLocale(locale);
  const t = await getTranslations({ locale, namespace: 'legal' });

  const title =
    slug === 'privacy'
      ? t('privacyTitle')
      : slug === 'terms'
        ? t('termsTitle')
        : slug.replace(/-/g, ' ');

  return (
    <section className="mx-auto max-w-3xl px-6 py-24">
      <h1 className="text-3xl font-semibold capitalize">{title}</h1>
      <p className="mt-4 text-zinc-600">{t('placeholder')}</p>
    </section>
  );
}
