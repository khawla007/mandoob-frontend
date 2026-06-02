import { getTranslations } from 'next-intl/server';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import type { CostDataRow } from '@/lib/data/cost-data';
import { formatMinorAsAed } from '@/lib/validation/cost-data';

export async function CostDataTable({
  rows,
  renderActions,
}: {
  rows: CostDataRow[];
  renderActions: (row: CostDataRow) => React.ReactNode;
}) {
  const t = await getTranslations('admin');
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">{t('costData.table.empty')}</p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('costData.table.authority')}</TableHead>
            <TableHead>{t('costData.table.fee')}</TableHead>
            <TableHead>{t('costData.table.status')}</TableHead>
            <TableHead>{t('costData.table.range')}</TableHead>
            <TableHead>{t('costData.table.timeline')}</TableHead>
            <TableHead>{t('costData.table.validity')}</TableHead>
            <TableHead className="text-right">{t('costData.table.amount')}</TableHead>
            <TableHead className="text-right">{t('costData.table.actions')}</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((row) => (
            <TableRow key={row.id}>
              <TableCell>
                <div className="font-medium">{row.authority}</div>
                <div className="text-muted-foreground text-xs">
                  {row.jurisdiction}
                  {row.emirate ? ` · ${row.emirate}` : ''}
                </div>
              </TableCell>
              <TableCell>
                <div className="font-medium">{row.label}</div>
                <div className="text-muted-foreground text-xs">
                  {row.feeType}
                  {row.activityKey ? ` · ${row.activityKey}` : ''}
                </div>
              </TableCell>
              <TableCell>
                <div className="flex flex-col items-start gap-1">
                  <Badge variant={row.active ? 'default' : 'secondary'}>
                    {row.active ? t('costData.table.active') : t('costData.table.inactive')}
                  </Badge>
                  {row.estimateGrade ? (
                    <Badge variant="outline">{t('costData.table.estimate')}</Badge>
                  ) : null}
                </div>
              </TableCell>
              <TableCell className="text-sm">
                <div>
                  {t('costData.table.shareholders', {
                    min: row.minShareholders,
                    max: row.maxShareholders,
                  })}
                </div>
                <div className="text-muted-foreground">
                  {t('costData.table.visas', { min: row.minVisas, max: row.maxVisas })}
                </div>
              </TableCell>
              <TableCell>
                {t('costData.table.days', { min: row.timelineMinDays, max: row.timelineMaxDays })}
              </TableCell>
              <TableCell className="text-sm">
                <div>{row.validFrom}</div>
                <div className="text-muted-foreground">
                  {row.validTo ?? t('costData.table.openEnded')}
                </div>
              </TableCell>
              <TableCell className="text-right font-medium">
                AED {formatMinorAsAed(row.amountMinor)}
                <div className="text-muted-foreground text-xs">{row.recurrence}</div>
              </TableCell>
              <TableCell className="text-right">{renderActions(row)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
