'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { updateContactAction } from '@/app/(tenant)/t/[tenant]/(pro)/settings/actions';
import type { TenantContact } from '@/lib/data/tenant-settings';

export function SettingsContactCard({
  slug,
  initial,
  disabled = false,
}: {
  slug: string;
  initial: TenantContact;
  disabled?: boolean;
}) {
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
        <CardTitle className="text-lg">Contact & legal</CardTitle>
        <CardDescription>Email sender identity and public legal page links.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-4" onSubmit={onSubmit}>
          {error && (
            <Alert variant="destructive">
              <AlertTitle>Could not save</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {saved && (
            <Alert>
              <AlertTitle>Saved</AlertTitle>
              <AlertDescription>Contact info updated.</AlertDescription>
            </Alert>
          )}

          <div className="grid gap-2">
            <Label htmlFor="contact-sender-name">Email sender name</Label>
            <Input
              id="contact-sender-name"
              maxLength={120}
              value={senderName}
              onChange={(e) => setSenderName(e.target.value)}
              placeholder="Acme PRO Services"
              disabled={disabled}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="contact-reply-to">Reply-to email</Label>
            <Input
              id="contact-reply-to"
              type="email"
              value={replyTo}
              onChange={(e) => setReplyTo(e.target.value)}
              placeholder="hello@acmepro.ae"
              disabled={disabled}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="contact-terms">Terms URL</Label>
            <Input
              id="contact-terms"
              type="url"
              value={terms}
              onChange={(e) => setTerms(e.target.value)}
              placeholder="https://acmepro.ae/terms"
              disabled={disabled}
            />
          </div>

          <div className="grid gap-2">
            <Label htmlFor="contact-privacy">Privacy URL</Label>
            <Input
              id="contact-privacy"
              type="url"
              value={privacy}
              onChange={(e) => setPrivacy(e.target.value)}
              placeholder="https://acmepro.ae/privacy"
              disabled={disabled}
            />
          </div>

          {!disabled && (
            <Button type="submit" disabled={pending}>
              {pending ? 'Saving…' : 'Save contact info'}
            </Button>
          )}
        </form>
      </CardContent>
    </Card>
  );
}
