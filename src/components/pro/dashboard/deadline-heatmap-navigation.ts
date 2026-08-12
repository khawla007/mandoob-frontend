export type DeadlineGridKey = 'ArrowLeft' | 'ArrowRight' | 'ArrowUp' | 'ArrowDown' | 'Home' | 'End';

export function nextDeadlineCellIndex(
  index: number,
  key: DeadlineGridKey,
  rows: number,
  columns: number,
  direction: 'ltr' | 'rtl',
): number {
  const row = Math.floor(index / columns);
  const column = index % columns;
  const horizontal = direction === 'rtl' ? -1 : 1;
  if (key === 'Home') return row * columns;
  if (key === 'End') return row * columns + columns - 1;
  if (key === 'ArrowRight')
    return column + horizontal < 0 || column + horizontal >= columns ? index : index + horizontal;
  if (key === 'ArrowLeft')
    return column - horizontal < 0 || column - horizontal >= columns ? index : index - horizontal;
  if (key === 'ArrowDown') return row + 1 < rows ? index + columns : index;
  if (key === 'ArrowUp') return row > 0 ? index - columns : index;
  return index;
}
