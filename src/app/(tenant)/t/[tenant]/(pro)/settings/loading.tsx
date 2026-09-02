export default function SettingsLoading() {
  return (
    <div
      className="mx-auto w-full max-w-[96rem] space-y-6"
      aria-busy="true"
      aria-label="Loading settings"
    >
      <div className="bg-muted h-20 animate-pulse rounded-xl" />
      <div className="bg-muted h-28 animate-pulse rounded-xl" />
      <div className="bg-muted h-72 animate-pulse rounded-xl" />
    </div>
  );
}
