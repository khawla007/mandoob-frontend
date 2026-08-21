import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { requirePlatformOperator } from '@/lib/auth/require-role';
import { readCompanyOnboarding } from '@/lib/data/company-onboarding';
import { getCompanyById } from '@/lib/data/pro-firms';
import {
  adminCompanyOnboardingSectionHref,
  canonicalAdminCompanyOnboardingSection,
} from './route-logic';

export const dynamic = 'force-dynamic';

const idSchema = z.string().uuid();

export default async function AdminCompanyOnboardingIndex({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const operator = await requirePlatformOperator();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const company = await getCompanyById(id);
  if (!company) notFound();
  const snapshot = await readCompanyOnboarding({
    actorProfileId: operator.id,
    tenantId: company.tenantId,
    companyId: company.id,
  });
  if (!snapshot) notFound();
  const section = canonicalAdminCompanyOnboardingSection(snapshot);
  redirect(adminCompanyOnboardingSectionHref(company.id, section));
}
