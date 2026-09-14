import {
  REGISTRATION_STAGE_CODES,
  REGISTRATION_STAGE_STATUSES,
  type RegistrationStageCode,
  type RegistrationStageStatus,
} from './contracts';

export type AdminRegistrationQuery = {
  company: string | null;
  pro: string | null;
  stage: RegistrationStageCode | 'all';
  status: RegistrationStageStatus | 'all';
  page: number;
};

type RawQuery = Record<string, string | string[] | undefined>;
const one = (value: string | string[] | undefined) => (typeof value === 'string' ? value : null);
const text = (value: string | null) => value?.trim().slice(0, 100) || null;

export function parseAdminRegistrationQuery(raw: RawQuery): AdminRegistrationQuery {
  const stage = one(raw.stage);
  const status = one(raw.status);
  const parsedPage = Number.parseInt(one(raw.page) ?? '1', 10);
  return {
    company: text(one(raw.company)),
    pro: text(one(raw.pro)),
    stage: REGISTRATION_STAGE_CODES.includes(stage as RegistrationStageCode)
      ? (stage as RegistrationStageCode)
      : 'all',
    status: REGISTRATION_STAGE_STATUSES.includes(status as RegistrationStageStatus)
      ? (status as RegistrationStageStatus)
      : 'all',
    page:
      Number.isSafeInteger(parsedPage) && parsedPage >= 1 && parsedPage <= 10_000 ? parsedPage : 1,
  };
}

export function adminRegistrationHref(query: AdminRegistrationQuery): string {
  const params = new URLSearchParams();
  if (query.company) params.set('company', query.company);
  if (query.pro) params.set('pro', query.pro);
  if (query.stage !== 'all') params.set('stage', query.stage);
  if (query.status !== 'all') params.set('status', query.status);
  if (query.page > 1) params.set('page', String(query.page));
  const value = params.toString();
  return value ? `/admin/registrations?${value}` : '/admin/registrations';
}
