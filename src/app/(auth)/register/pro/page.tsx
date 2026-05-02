import Link from 'next/link';
import { RegisterProForm } from '@/components/auth/RegisterProForm';

export default function RegisterProPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Register a PRO firm</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Submit your firm for review. Once approved, you&apos;ll get an invite email and full
          access to the PRO workspace.
        </p>
      </div>
      <RegisterProForm />
      <p className="text-muted-foreground text-center text-sm">
        Already have an account?{' '}
        <Link
          href="/login"
          className="text-foreground font-medium underline-offset-4 hover:underline"
        >
          Sign in
        </Link>
      </p>
    </div>
  );
}
