import { MfaChallengeForm } from '@/components/auth/MfaChallengeForm';

export default function MfaChallengePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Enter two-factor code</h1>
      <MfaChallengeForm />
    </div>
  );
}
