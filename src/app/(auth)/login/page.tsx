import Link from 'next/link';
import { LoginForm } from '@/components/auth/LoginForm';

export default function LoginPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
        <p className="text-muted-foreground mt-1 text-sm">Welcome back to Mandoob.</p>
      </div>
      <LoginForm />
      <div className="flex justify-between text-sm">
        <Link
          href="/forgot-password"
          className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
        >
          Forgot password?
        </Link>
        <Link href="/register" className="font-medium underline-offset-4 hover:underline">
          Create an account
        </Link>
      </div>
    </div>
  );
}
