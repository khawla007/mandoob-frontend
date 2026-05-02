import { MfaEnrollCard } from '@/components/auth/MfaEnrollCard';

export default function MfaEnrollPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Enable two-factor</h1>
        <p className="mt-1 text-sm text-zinc-500">
          Scan the QR with an authenticator app, then enter the 6-digit code.
        </p>
      </div>
      <MfaEnrollCard />
    </div>
  );
}
