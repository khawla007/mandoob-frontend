import Link from 'next/link';
import { BadgeCheck, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export const dynamic = 'force-dynamic';

export default async function ProEmployeesPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Employees</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Employee directory management is still staged, but CSV onboarding is available.
          </p>
        </div>
        <Button asChild>
          <Link href={`/t/${tenant}/employees/import`}>
            <Upload className="mr-2 size-4" />
            Import CSV
          </Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <BadgeCheck className="size-5 opacity-70" />
            Directory
          </CardTitle>
          <CardDescription>
            Employee list, edit, and invite workflows ship in a later step.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground py-8 text-center text-sm">
            Use CSV import to onboard employees under an existing client.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
