export default function EmployeesLoading() {
  return (
    <div className="space-y-6" aria-busy="true">
      <div className="bg-muted h-20 animate-pulse rounded-lg" />
      <div className="grid gap-3 sm:grid-cols-3">
        {Array.from({ length: 3 }, (_, index) => (
          <div className="bg-muted h-24 animate-pulse rounded-lg" key={index} />
        ))}
      </div>
      <div className="bg-muted h-96 animate-pulse rounded-lg" />
    </div>
  );
}
