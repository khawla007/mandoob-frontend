export default function ImportJobLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="bg-muted h-20 animate-pulse rounded-lg" />
      <div className="bg-muted h-40 animate-pulse rounded-lg" />
      <div className="bg-muted h-72 animate-pulse rounded-lg" />
    </div>
  );
}
