import { cloneElement, type ReactElement, type ReactNode } from 'react';
import { Label } from '@/components/ui/label';

export function AccessibleCompanyField({
  id,
  label,
  description,
  error,
  children,
}: {
  id: string;
  label: ReactNode;
  description: ReactNode;
  error?: ReactNode;
  children?: ReactElement<Record<string, unknown>>;
}) {
  if (!children) throw new Error('AccessibleCompanyField requires a form control');
  const descriptionId = `${id}-description`;
  const errorId = `${id}-error`;
  const control = cloneElement(children, {
    id,
    'aria-invalid': Boolean(error),
    'aria-describedby': error ? `${descriptionId} ${errorId}` : descriptionId,
  });

  return (
    <div className="grid gap-2">
      <Label htmlFor={id}>{label}</Label>
      {control}
      <p id={descriptionId} className="text-muted-foreground text-sm">
        {description}
      </p>
      {error ? (
        <p id={errorId} className="text-destructive text-sm">
          {error}
        </p>
      ) : null}
    </div>
  );
}
