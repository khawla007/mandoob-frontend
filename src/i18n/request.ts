import { getRequestConfig } from 'next-intl/server';
import { routing, type Locale } from './routing';

import enCommon from '@/messages/en/common.json';
import enHome from '@/messages/en/home.json';
import enPricing from '@/messages/en/pricing.json';
import enEstimate from '@/messages/en/estimate.json';
import enKnowledgeBase from '@/messages/en/knowledge-base.json';
import enLegal from '@/messages/en/legal.json';
import enCompanySetup from '@/messages/en/company-setup.json';
import enApply from '@/messages/en/apply.json';

import arCommon from '@/messages/ar/common.json';
import arHome from '@/messages/ar/home.json';
import arPricing from '@/messages/ar/pricing.json';
import arEstimate from '@/messages/ar/estimate.json';
import arKnowledgeBase from '@/messages/ar/knowledge-base.json';
import arLegal from '@/messages/ar/legal.json';
import arCompanySetup from '@/messages/ar/company-setup.json';
import arApply from '@/messages/ar/apply.json';

const MESSAGES_BY_LOCALE = {
  en: {
    common: enCommon,
    home: enHome,
    pricing: enPricing,
    estimate: enEstimate,
    'knowledge-base': enKnowledgeBase,
    legal: enLegal,
    'company-setup': enCompanySetup,
    apply: enApply,
  },
  ar: {
    common: arCommon,
    home: arHome,
    pricing: arPricing,
    estimate: arEstimate,
    'knowledge-base': arKnowledgeBase,
    legal: arLegal,
    'company-setup': arCompanySetup,
    apply: arApply,
  },
} satisfies Record<Locale, Record<string, unknown>>;

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale: Locale = (routing.locales as readonly string[]).includes(requested ?? '')
    ? (requested as Locale)
    : routing.defaultLocale;

  return { locale, messages: MESSAGES_BY_LOCALE[locale] };
});
