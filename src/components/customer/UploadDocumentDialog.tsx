'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

export function UploadDocumentDialog({ docTitle }: { docTitle: string }) {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          Upload
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload — {docTitle}</DialogTitle>
          <DialogDescription>
            Document uploads are wired in Step 12 (Document Management). This dialog confirms the
            layout and the entry point.
          </DialogDescription>
        </DialogHeader>

        <Alert>
          <AlertTitle>Coming soon</AlertTitle>
          <AlertDescription>
            File picker, type validation, virus scan, and tenant-scoped storage land in Step 12.
          </AlertDescription>
        </Alert>

        <div className="grid gap-2">
          <Label htmlFor="upload-file">File</Label>
          <Input id="upload-file" type="file" disabled />
          <p className="text-muted-foreground text-xs">PDF, JPEG, PNG, DOCX up to 25 MB.</p>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled>Upload</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
