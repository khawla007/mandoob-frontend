import { InviteAcceptForm } from '@/components/auth/InviteAcceptForm';

export default async function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold">Accept invitation</h1>
        <p className="mt-1 text-sm text-zinc-500">Set your password and finish setup.</p>
      </div>
      <InviteAcceptForm token={token} />
    </div>
  );
}
