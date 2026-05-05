import { readSelfProfile } from '@/lib/data/account-self';
import {
  SUPPORTED_DATE_FORMATS,
  SUPPORTED_LOCALES,
  SUPPORTED_TIMEZONES,
} from '@/lib/validation/account';
import { ProfileForm } from './ProfileForm';
import { ProfileGeneralForm } from './ProfileGeneralForm';

type LocaleOpt = (typeof SUPPORTED_LOCALES)[number];
type TimezoneOpt = (typeof SUPPORTED_TIMEZONES)[number];
type DateFormatOpt = (typeof SUPPORTED_DATE_FORMATS)[number];

function pickEnum<T extends readonly string[]>(
  list: T,
  value: string | null | undefined,
  fallback: T[number],
): T[number] {
  if (value && (list as readonly string[]).includes(value)) return value as T[number];
  return fallback;
}

export async function ProfileTab() {
  const profile = await readSelfProfile();
  const useGeneral =
    profile.role === 'super_admin' || profile.role === 'admin' || profile.role === 'pro';

  if (useGeneral) {
    return (
      <ProfileGeneralForm
        initial={{
          display_name: profile.fullName ?? '',
          username: profile.username ?? '',
          title: profile.title ?? '',
          phone: profile.phone ?? '',
          avatar_url: profile.avatarUrl ?? '',
          locale: pickEnum<typeof SUPPORTED_LOCALES>(
            SUPPORTED_LOCALES,
            profile.locale,
            'en',
          ) as LocaleOpt,
          timezone: pickEnum<typeof SUPPORTED_TIMEZONES>(
            SUPPORTED_TIMEZONES,
            profile.timezone,
            'Asia/Dubai',
          ) as TimezoneOpt,
          date_format: pickEnum<typeof SUPPORTED_DATE_FORMATS>(
            SUPPORTED_DATE_FORMATS,
            profile.dateFormat,
            'YYYY-MM-DD',
          ) as DateFormatOpt,
          bio: profile.bio ?? '',
        }}
        readOnly={{
          email: profile.email ?? '—',
          role: profile.role,
          tenantId: profile.tenantId,
          createdAt: profile.createdAt,
          mfaEnrolledAt: profile.mfaEnrolledAt,
        }}
      />
    );
  }

  return (
    <ProfileForm
      initial={{
        display_name: profile.fullName ?? '',
        phone: profile.phone ?? '',
      }}
      role={profile.role}
      readOnly={{
        email: profile.email ?? '—',
        role: profile.role,
        tenantId: profile.tenantId,
        createdAt: profile.createdAt,
      }}
    />
  );
}
