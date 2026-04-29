'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ChevronRight, RotateCcw } from 'lucide-react';

export function UsersPagination({
  nextCursor,
  hasMore,
}: {
  nextCursor: string | null;
  hasMore: boolean;
}) {
  const router = useRouter();
  const params = useSearchParams();
  const onCursor = params.has('cursor');

  function go(cursor: string | null) {
    const next = new URLSearchParams(params.toString());
    if (cursor) next.set('cursor', cursor);
    else next.delete('cursor');
    router.replace(`/admin/users?${next.toString()}`);
  }

  return (
    <div className="flex items-center justify-end gap-2 pt-2">
      {onCursor && (
        <Button variant="ghost" size="sm" onClick={() => go(null)}>
          <RotateCcw className="size-3" />
          Back to start
        </Button>
      )}
      <Button
        variant="outline"
        size="sm"
        disabled={!hasMore || !nextCursor}
        onClick={() => nextCursor && go(nextCursor)}
      >
        Next
        <ChevronRight className="size-3" />
      </Button>
    </div>
  );
}
