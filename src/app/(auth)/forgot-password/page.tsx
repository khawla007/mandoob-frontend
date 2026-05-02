import { ForgotPasswordForm } from '@/components/auth/ForgotPasswordForm';

export default function ForgotPasswordPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold">Reset your password</h1>
      <p className="text-sm text-zinc-500">
        Enter your email and we&apos;ll send you a reset link.
      </p>
      <ForgotPasswordForm />
    </div>
  );
}
