'use client';

import { useState, useTransition } from 'react';
import { toast } from 'sonner';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  enrollMfaAction,
  finalizeMfaEnrollmentAction,
  removeMfaFactorAction,
} from '@/app/account/actions';

export type Factor = { id: string; status: string; friendlyName: string | null };

type EnrollState = { factorId: string; qrCode: string; secret: string } | null;

export function MfaPanel({ factors, mandatory }: { factors: Factor[]; mandatory: boolean }) {
  const t = useTranslations('account');
  const tCommon = useTranslations('common');
  const [enroll, setEnroll] = useState<EnrollState>(null);
  const [code, setCode] = useState('');
  const [isPending, startTransition] = useTransition();

  const verified = factors.filter((f) => f.status === 'verified');
  const lastVerified = mandatory && verified.length <= 1;

  const startEnroll = () => {
    startTransition(async () => {
      const res = await enrollMfaAction();
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      setEnroll(res.data!);
    });
  };

  const finalize = () => {
    if (!enroll) return;
    startTransition(async () => {
      const res = await finalizeMfaEnrollmentAction({ factor_id: enroll.factorId, code });
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success(t('mfaEnrolledToast'));
      setEnroll(null);
      setCode('');
      window.location.reload();
    });
  };

  const remove = (factorId: string) => {
    startTransition(async () => {
      const res = await removeMfaFactorAction(factorId);
      if (!res.ok) {
        toast.error(res.error.message);
        return;
      }
      toast.success(t('factorRemoved'));
      window.location.reload();
    });
  };

  return (
    <div className="space-y-6">
      <ul className="space-y-2">
        {factors.length === 0 && (
          <li className="text-muted-foreground text-sm">{t('noFactorsEnrolled')}</li>
        )}
        {factors.map((f) => {
          const blocked = f.status === 'verified' && lastVerified;
          return (
            <li key={f.id} className="flex items-center justify-between rounded border p-3 text-sm">
              <span>
                {f.friendlyName ?? 'TOTP'}{' '}
                <span className="text-muted-foreground">({f.status})</span>
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isPending || blocked}
                onClick={() => remove(f.id)}
                title={blocked ? t('longCopy.mfaLastFactorBlock') : undefined}
              >
                {t('removeFactor')}
              </Button>
            </li>
          );
        })}
      </ul>

      {!enroll && (
        <Button type="button" onClick={startEnroll} disabled={isPending}>
          {isPending ? tCommon('loading') : t('addTotpFactor')}
        </Button>
      )}

      {enroll && (
        <div className="space-y-4 rounded border p-4">
          <p className="text-sm">{t('longCopy.mfaScanInstruction')}</p>
          <div className="bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={enroll.qrCode} alt={t('mfaQrAlt')} className="size-48" />
          </div>
          <p className="text-muted-foreground text-xs">
            {t('mfaEnterSecretManually')} <code>{enroll.secret}</code>
          </p>
          <div className="space-y-1">
            <Label htmlFor="mfa_code">{t('verificationCode')}</Label>
            <Input
              id="mfa_code"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <Button type="button" onClick={finalize} disabled={isPending || code.length !== 6}>
              {t('verifyAndEnable')}
            </Button>
            <Button type="button" variant="outline" onClick={() => setEnroll(null)}>
              {tCommon('cancel')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
