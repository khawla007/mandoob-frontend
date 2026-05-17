import { getTranslations } from 'next-intl/server';

export async function ComingSoon({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle: string;
  icon: React.ReactNode;
}) {
  const tCommon = await getTranslations('common');
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{subtitle}</p>
      </div>
      <div className="border-border/60 text-muted-foreground flex h-64 items-center justify-center rounded-lg border border-dashed">
        <div className="flex flex-col items-center gap-2 text-sm">
          {icon}
          {tCommon('comingSoon')}
        </div>
      </div>
    </div>
  );
}
