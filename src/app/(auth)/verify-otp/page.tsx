import { redirect } from 'next/navigation';
import { OtpForm } from '@/components/auth/OtpForm';

export const dynamic = 'force-dynamic';

export default async function VerifyOtpPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string }>;
}) {
  const { email } = await searchParams;
  if (!email) redirect('/register');

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">Enter your code</h1>
        <p className="text-muted-foreground text-sm">
          We sent a 6-digit code to <strong className="text-foreground">{email}</strong>.
        </p>
      </div>
      <OtpForm email={email} />
    </div>
  );
}
