import 'server-only';
import { enqueueEmail } from './send';

export async function sendInviteEmail(args: {
  to: string;
  tenantName: string;
  role: 'pro' | 'customer' | 'employee' | 'admin';
  inviteUrl: string;
  tenantId?: string | null;
}): Promise<void> {
  const result = await enqueueEmail({
    tenantId: args.tenantId ?? null,
    templateId: 'generic-invite',
    toAddress: args.to,
    input: {
      toName: 'there',
      tenantName: args.tenantName,
      role: args.role,
      inviteUrl: args.inviteUrl,
    },
  });
  if (!result.ok) throw new Error(`enqueue invite failed: ${result.reason}`);
}
