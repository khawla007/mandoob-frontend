import Link from 'next/link';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { uploadBulkImportAction } from '../../imports/actions';

export const dynamic = 'force-dynamic';

export default async function ClientImportPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant } = await params;

  async function upload(formData: FormData) {
    'use server';
    await uploadBulkImportAction(tenant, 'clients', formData);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Import clients</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Upload the fixed-column CSV template, validate rows, then confirm the import.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/t/${tenant}/clients`}>Back to clients</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Client CSV</CardTitle>
          <CardDescription>
            Existing trade license numbers are skipped by default during import.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={upload} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="file">CSV file</Label>
              <Input id="file" name="file" type="file" accept=".csv" required />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit">
                <Upload className="mr-2 size-4" />
                Upload CSV
              </Button>
              <Button variant="outline" asChild>
                <Link href="/templates/clients-import-template.csv">Download template</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
