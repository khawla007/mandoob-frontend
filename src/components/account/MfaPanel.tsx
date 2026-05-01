'use client';

export type Factor = { id: string; status: string; friendlyName: string | null };

export function MfaPanel({ factors, mandatory }: { factors: Factor[]; mandatory: boolean }) {
  return (
    <div className="text-muted-foreground text-sm">
      MFA panel coming next. Mandatory for this role: {String(mandatory)}. Existing factors:{' '}
      {factors.length}.
    </div>
  );
}
