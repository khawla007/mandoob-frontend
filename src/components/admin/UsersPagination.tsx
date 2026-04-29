'use client';

import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ChevronRight, RotateCcw } from 'lucide-react';
import { useListFilterNav } from '@/hooks/use-list-filter-nav';

export function UsersPagination({
  nextCursor,
  hasMore,
}: {
  nextCursor: string | null;
  hasMore: boolean;
}) {
  const params = useSearchParams();
  const { navigate } = useListFilterNav('/admin/users');
  const onCursor = params.has('cursor');

  return (
    <div className="flex items-center justify-end gap-2 pt-2">
      {onCursor && (
        <Button variant="ghost" size="sm" onClick={() => navigate({ cursor: null })}>
          <RotateCcw className="size-3" />
          Back to start
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={!hasMore || !nextCursor}
        onClick={() => nextCursor && navigate({ cursor: nextCursor })}
      >
        Next
        <ChevronRight className="size-3" />
      </Button>
    </div>
  );
}
