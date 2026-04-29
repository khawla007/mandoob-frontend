import Link from 'next/link';
import { Users } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function UsersEmptyState({ filtersActive }: { filtersActive: boolean }) {
  return (
    <div className="border-border/60 flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed py-12">
      <Users className="text-muted-foreground size-8" />
      <p className="text-sm font-medium">No users match your filters</p>
      {filtersActive ? (
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/users">Reset filters</Link>
        </Button>
      ) : (
        <p className="text-muted-foreground text-xs">No users have been created yet.</p>
      )}
    </div>
  );
}
