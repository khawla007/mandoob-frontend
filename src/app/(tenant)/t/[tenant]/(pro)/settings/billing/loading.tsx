export default function BillingSettingsLoading() {
  return (
    <div
      className="mx-auto w-full max-w-[96rem] space-y-6"
      aria-busy="true"
      aria-label="Loading billing"
    >
      <div className="bg-muted h-20 animate-pulse rounded-xl" />
      <div className="bg-muted h-64 animate-pulse rounded-xl" />
    </div>
  );
}
