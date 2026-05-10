import Link from 'next/link';
import { Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { listClientsForTenant } from '@/lib/data/clients';
import { resolveTenantBySlug } from '@/lib/data/tenant';
import { uploadBulkImportAction } from '../../imports/actions';

export const dynamic = 'force-dynamic';

export default async function EmployeeImportPage({ params }: { params: Promise<{ tenant: string }> }) {
  const { tenant: slug } = await params;
  const tenant = await resolveTenantBySlug(slug);
  const clients = tenant ? await listClientsForTenant({ tenantId: tenant.id, limit: 50 }) : [];

  async function upload(formData: FormData) {
    'use server';
    await uploadBulkImportAction(slug, 'employees', formData);
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Import employees</h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Select the parent client, upload the CSV template, then validate before import.
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href={`/t/${slug}/employees`}>Back to employees</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-lg">Employee CSV</CardTitle>
          <CardDescription>
            Existing passport numbers under the selected client are skipped by default.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form action={upload} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="parent_client_id">Parent client</Label>
              <Select name="parent_client_id" required>
                <SelectTrigger id="parent_client_id">
                  <SelectValue placeholder="Choose client" />
                </SelectTrigger>
                <SelectContent>
                  {clients.map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.company_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label htmlFor="file">CSV file</Label>
              <Input id="file" name="file" type="file" accept=".csv" required />
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Button type="submit" disabled={clients.length === 0}>
                <Upload className="mr-2 size-4" />
                Upload CSV
              </Button>
              <Button variant="outline" asChild>
                <Link href="/templates/employees-import-template.csv">Download template</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
