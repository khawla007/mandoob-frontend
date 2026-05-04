import { Badge } from '@/components/ui/badge';
import { UploadDocumentDialog } from './UploadDocumentDialog';
import type { ActiveDocRequest, DocRequestStatus } from '@/lib/mocks/customer-portal';

const STATUS_VARIANT: Record<DocRequestStatus, 'secondary' | 'default' | 'outline'> = {
  requested: 'secondary',
  uploaded: 'default',
  under_review: 'outline',
};

const STATUS_LABEL: Record<DocRequestStatus, string> = {
  requested: 'Requested',
  uploaded: 'Uploaded',
  under_review: 'Under review',
};

function dueLine(iso: string): string {
  const days = Math.round((new Date(iso).getTime() - Date.now()) / 864e5);
  if (days < 0) return `${Math.abs(days)} days overdue`;
  if (days === 0) return 'Due today';
  if (days === 1) return 'Due tomorrow';
  return `Due in ${days} days · ${iso.slice(0, 10)}`;
}

export function DocumentRequestRow({ row }: { row: ActiveDocRequest }) {
  const showUpload = row.status === 'requested';
  return (
    <li className="flex flex-wrap items-start justify-between gap-3 py-3 first:pt-0">
      <div className="min-w-0">
        <div className="text-sm font-medium">{row.title}</div>
        <div className="text-muted-foreground mt-0.5 text-xs">{dueLine(row.dueDate)}</div>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={STATUS_VARIANT[row.status]}>{STATUS_LABEL[row.status]}</Badge>
        {showUpload && <UploadDocumentDialog docTitle={row.title} />}
      </div>
    </li>
  );
}
