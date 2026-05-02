import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { ProfileCard } from '@/lib/data/profile';

function formatDate(iso: string | null): string {
  if (!iso) return '—';
  return new Date(iso).toLocaleString('en-GB', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

export function ProfileCardView({ profile, title }: { profile: ProfileCard; title: string }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">{title}</CardTitle>
        <CardDescription>Your Mandoob identity — synced from Supabase.</CardDescription>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 text-sm sm:grid-cols-2">
          <Field label="Full name" value={profile.fullName ?? '—'} />
          <Field label="Email" value={profile.email ?? '—'} />
          <Field label="Phone" value={profile.phone ?? '—'} />
          <Field
            label="Role"
            value={
              profile.role ? (
                <Badge variant="secondary" className="font-mono text-xs">
                  {profile.role}
                </Badge>
              ) : (
                '—'
              )
            }
          />
          <Field
            label="Workspace"
            value={profile.tenantSlug ? `${profile.tenantName} (/${profile.tenantSlug})` : '—'}
          />
          <Field label="Status" value={profile.status ?? '—'} />
          <Field label="Joined" value={formatDate(profile.createdAt)} />
          <Field label="Consent accepted" value={formatDate(profile.consentAcceptedAt)} />
        </dl>
      </CardContent>
    </Card>
  );
}

function Field({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <dt className="text-muted-foreground text-xs tracking-wide uppercase">{label}</dt>
      <dd className="mt-1 font-medium">{value}</dd>
    </div>
  );
}
