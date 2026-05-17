import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { CostDataRow } from '@/lib/data/cost-data';
import { formatMinorAsAed } from '@/lib/validation/cost-data';

export function CostDataTable({
  rows,
  renderActions,
}: {
  rows: CostDataRow[];
  renderActions: (row: CostDataRow) => React.ReactNode;
}) {
  if (rows.length === 0) {
    return <p className="text-muted-foreground py-8 text-center text-sm">No cost-data rows match the current filters.</p>;
  }

  return (
    <div className="overflow-x-auto rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Authority</TableHead>
            <TableHead>Fee</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Range</TableHead>
            <TableHead>Timeline</TableHead>
            <TableHead>Validity</TableHead>
            <TableHead className="text-right">Amount</TableHead>
            <TableHead className="text-right">Actions</TableHead>
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
                  <Badge variant={row.active ? 'default' : 'secondary'}>{row.active ? 'active' : 'inactive'}</Badge>
                  {row.estimateGrade ? <Badge variant="outline">estimate</Badge> : null}
                </div>
              </TableCell>
              <TableCell className="text-sm">
                <div>Shareholders {row.minShareholders}-{row.maxShareholders}</div>
                <div className="text-muted-foreground">Visas {row.minVisas}-{row.maxVisas}</div>
              </TableCell>
              <TableCell>{row.timelineMinDays}-{row.timelineMaxDays} days</TableCell>
              <TableCell className="text-sm">
                <div>{row.validFrom}</div>
                <div className="text-muted-foreground">{row.validTo ?? 'open-ended'}</div>
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
