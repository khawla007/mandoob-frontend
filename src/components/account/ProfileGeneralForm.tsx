'use client';

import { useState, useTransition } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import {
  ProfileGeneralSchema,
  SUPPORTED_DATE_FORMATS,
  SUPPORTED_LOCALES,
  SUPPORTED_TIMEZONES,
  type ProfileGeneralInput,
} from '@/lib/validation/account';
import { updateProfileAction } from '@/app/account/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import type { Role } from '@/lib/auth/roles';

type Initial = {
  display_name: string;
  username: string;
  title: string;
  phone: string;
  avatar_url: string;
  locale: (typeof SUPPORTED_LOCALES)[number];
  timezone: (typeof SUPPORTED_TIMEZONES)[number];
  date_format: (typeof SUPPORTED_DATE_FORMATS)[number];
  bio: string;
};

type ReadOnly = {
  email: string;
  role: Role;
  tenantId: string | null;
  createdAt: string | null;
  mfaEnrolledAt: string | null;
};

type Props = {
  initial: Initial;
  readOnly: ReadOnly;
};

const LOCALE_LABELS: Record<(typeof SUPPORTED_LOCALES)[number], string> = {
  en: 'English',
  ar: 'العربية (Arabic)',
};

const DATE_FORMAT_LABELS: Record<(typeof SUPPORTED_DATE_FORMATS)[number], string> = {
  'YYYY-MM-DD': 'YYYY-MM-DD (2026-12-31)',
  'DD/MM/YYYY': 'DD/MM/YYYY (31/12/2026)',
  'MM/DD/YYYY': 'MM/DD/YYYY (12/31/2026)',
};

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join('');
}

export function ProfileGeneralForm({ initial, readOnly }: Props) {
  const t = useTranslations('account');
  const tCommon = useTranslations('common');
  const tShell = useTranslations('shell');
  const [isPending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const form = useForm<ProfileGeneralInput>({
    resolver: zodResolver(ProfileGeneralSchema),
    defaultValues: {
      display_name: initial.display_name,
      username: initial.username,
      title: initial.title,
      phone: initial.phone,
      avatar_url: initial.avatar_url,
      locale: initial.locale,
      timezone: initial.timezone,
      date_format: initial.date_format,
      bio: initial.bio,
    },
    mode: 'onBlur',
  });

  const watchedAvatar = useWatch({ control: form.control, name: 'avatar_url' });
  const watchedName = useWatch({ control: form.control, name: 'display_name' });
  const watchedBio = useWatch({ control: form.control, name: 'bio' }) ?? '';
  const watchedLocale = useWatch({ control: form.control, name: 'locale' });
  const watchedTimezone = useWatch({ control: form.control, name: 'timezone' });
  const watchedDateFormat = useWatch({ control: form.control, name: 'date_format' });

  const onSubmit = form.handleSubmit((values) => {
    setServerError(null);
    startTransition(async () => {
      const res = await updateProfileAction(values);
      if (!res.ok) {
        setServerError(res.error.message);
        toast.error(res.error.message);
        return;
      }
      toast.success(res.data?.changedKeys.length ? t('profileSaved') : t('noChanges'));
    });
  });

  const errors = form.formState.errors;

  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>{tShell('account')}</CardTitle>
          <CardDescription>{t('longCopy.readOnlyDetails')}</CardDescription>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-muted-foreground">{t('email')}</dt>
              <dd>{readOnly.email}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('role')}</dt>
              <dd className="capitalize">{readOnly.role.replace('_', ' ')}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('tenant')}</dt>
              <dd>{readOnly.tenantId ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('created')}</dt>
              <dd>{readOnly.createdAt ?? '—'}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">{t('mfaEnrolled')}</dt>
              <dd>{readOnly.mfaEnrolledAt ?? t('notEnrolled')}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('identitySection')}</CardTitle>
          <CardDescription>{t('longCopy.identityHelp')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16">
              {watchedAvatar ? <AvatarImage src={watchedAvatar} alt={watchedName} /> : null}
              <AvatarFallback>{initials(watchedName || readOnly.email)}</AvatarFallback>
            </Avatar>
            <div className="flex-1 space-y-1">
              <Label htmlFor="avatar_url">{t('avatarUrl')}</Label>
              <Input
                id="avatar_url"
                placeholder="https://example.com/me.jpg"
                {...form.register('avatar_url')}
                aria-describedby="avatar_url_err"
              />
              {errors.avatar_url && (
                <p id="avatar_url_err" role="alert" className="text-destructive text-sm">
                  {errors.avatar_url.message}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="display_name">
                {t('fullName')} <span className="text-destructive">*</span>
              </Label>
              <Input
                id="display_name"
                {...form.register('display_name')}
                aria-describedby="display_name_err"
                aria-invalid={!!errors.display_name}
              />
              {errors.display_name && (
                <p id="display_name_err" role="alert" className="text-destructive text-sm">
                  {errors.display_name.message}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="username">{t('username')}</Label>
              <Input
                id="username"
                placeholder="harman_admin"
                {...form.register('username')}
                aria-describedby="username_err"
                aria-invalid={!!errors.username}
              />
              {errors.username && (
                <p id="username_err" role="alert" className="text-destructive text-sm">
                  {errors.username.message}
                </p>
              )}
            </div>

            <div className="space-y-1 sm:col-span-2">
              <Label htmlFor="title">{t('title_field')}</Label>
              <Input
                id="title"
                placeholder="Platform Administrator"
                {...form.register('title')}
                aria-describedby="title_err"
              />
              {errors.title && (
                <p id="title_err" role="alert" className="text-destructive text-sm">
                  {errors.title.message}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('contactLocaleSection')}</CardTitle>
          <CardDescription>{t('longCopy.contactLocaleHelp')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="phone">{t('phone')}</Label>
              <Input
                id="phone"
                placeholder="+971501234567"
                {...form.register('phone')}
                aria-describedby="phone_err"
                aria-invalid={!!errors.phone}
              />
              {errors.phone && (
                <p id="phone_err" role="alert" className="text-destructive text-sm">
                  {errors.phone.message}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="locale">
                {t('locale')} <span className="text-destructive">*</span>
              </Label>
              <Select
                value={watchedLocale}
                onValueChange={(v) => form.setValue('locale', v as ProfileGeneralInput['locale'])}
              >
                <SelectTrigger id="locale" aria-invalid={!!errors.locale}>
                  <SelectValue placeholder={t('selectLanguage')} />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_LOCALES.map((l) => (
                    <SelectItem key={l} value={l}>
                      {LOCALE_LABELS[l]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.locale && (
                <p role="alert" className="text-destructive text-sm">
                  {errors.locale.message}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="timezone">
                {t('timezone')} <span className="text-destructive">*</span>
              </Label>
              <Select
                value={watchedTimezone}
                onValueChange={(v) =>
                  form.setValue('timezone', v as ProfileGeneralInput['timezone'])
                }
              >
                <SelectTrigger id="timezone" aria-invalid={!!errors.timezone}>
                  <SelectValue placeholder={t('selectTimezone')} />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_TIMEZONES.map((tz) => (
                    <SelectItem key={tz} value={tz}>
                      {tz}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.timezone && (
                <p role="alert" className="text-destructive text-sm">
                  {errors.timezone.message}
                </p>
              )}
            </div>

            <div className="space-y-1">
              <Label htmlFor="date_format">
                {t('dateFormat')} <span className="text-destructive">*</span>
              </Label>
              <Select
                value={watchedDateFormat}
                onValueChange={(v) =>
                  form.setValue('date_format', v as ProfileGeneralInput['date_format'])
                }
              >
                <SelectTrigger id="date_format" aria-invalid={!!errors.date_format}>
                  <SelectValue placeholder={t('selectDateFormat')} />
                </SelectTrigger>
                <SelectContent>
                  {SUPPORTED_DATE_FORMATS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {DATE_FORMAT_LABELS[f]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errors.date_format && (
                <p role="alert" className="text-destructive text-sm">
                  {errors.date_format.message}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t('aboutSection')}</CardTitle>
          <CardDescription>{t('longCopy.aboutHelp')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            <Label htmlFor="bio">{t('bio')}</Label>
            <Textarea
              id="bio"
              rows={4}
              maxLength={500}
              placeholder={t('bioPlaceholder')}
              {...form.register('bio')}
              aria-describedby="bio_err bio_count"
            />
            <div className="flex justify-between text-xs">
              {errors.bio ? (
                <p id="bio_err" role="alert" className="text-destructive">
                  {errors.bio.message}
                </p>
              ) : (
                <span className="text-muted-foreground">{t('markdownNotSupported')}</span>
              )}
              <span id="bio_count" className="text-muted-foreground tabular-nums">
                {watchedBio.length}/500
              </span>
            </div>
          </div>
        </CardContent>
      </Card>

      {serverError && (
        <p role="alert" className="text-destructive text-sm">
          {serverError}
        </p>
      )}

      <div className="bg-background sticky bottom-0 flex items-center justify-end gap-2 border-t pt-4">
        <Button
          type="button"
          variant="ghost"
          disabled={isPending || !form.formState.isDirty}
          onClick={() => form.reset()}
        >
          {t('reset')}
        </Button>
        <Button type="submit" disabled={isPending}>
          {isPending ? tCommon('saving') : t('saveChanges')}
        </Button>
      </div>
    </form>
  );
}
