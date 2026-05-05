import { PasswordChangeForm } from './PasswordChangeForm';

export function SecurityTab() {
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-medium">Change password</h2>
      <PasswordChangeForm />
    </section>
  );
}
