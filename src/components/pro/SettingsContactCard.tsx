'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { updateContactAction } from '@/app/(tenant)/t/[tenant]/(pro)/settings/actions';
import type { TenantContact } from '@/lib/data/tenant-settings';

export function SettingsContactCard({ slug, initial }: { slug: string; initial: TenantContact }) {
  const t = useTranslations('pro.settings');
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const [senderName, setSenderName] = useState(initial.email_sender_name ?? '');
  const [replyTo, setReplyTo] = useState(initial.email_reply_to ?? '');
  const [terms, setTerms] = useState(initial.terms_url ?? '');
  const [privacy, setPrivacy] = useState(initial.privacy_url ?? '');

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    startTransition(async () => {
      const r = await updateContactAction(slug, {
        email_sender_name: senderName,
        email_reply_to: replyTo,
        terms_url: terms,
        privacy_url: privacy,
      });
      if (!r.ok) {
        setError(`${r.code}: ${r.error}`);
        return;
      }
      setSaved(true);
      router.refresh();
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{t('contact.title')}</CardTitle>
        <CardDescription>{t('contact.description')}</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>{t('couldNotSave')}</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {saved && (
            <Alert>
              <AlertTitle>{t('saved')}</AlertTitle>
              <AlertDescription>{t('contact.savedDescription')}</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-2">
            <Label htmlFor="contact-sender-name">{t('contact.senderName')}</Label>
            <Input
              id="contact-sender-name"
              maxLength={120}
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              placeholder="Acme PRO Services"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="contact-reply-to">{t('contact.replyTo')}</Label>
            <Input
              id="contact-reply-to"
              type="email"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              placeholder="hello@acmepro.ae"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="contact-terms">{t('contact.termsUrl')}</Label>
            <Input
              id="contact-terms"
              type="url"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              placeholder="https://acmepro.ae/terms"
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="contact-privacy">{t('contact.privacyUrl')}</Label>
            <Input
              id="contact-privacy"
              type="url"
              value={privacy}
              onChange={(e) => setPrivacy(e.target.value)}
              placeholder="https://acmepro.ae/privacy"
            />
          </div>

          <Button type="submit" disabled={pending}>
            {pending ? t('saving') : t('contact.save')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
