'use client';

import Image from 'next/image';
import { useRef, useState, useTransition } from 'react';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { uploadBlogMediaAction } from '@/app/admin/blog/actions';

type MediaPreview = {
  id: string;
  url: string | null;
  name: string | null;
};

export function BlogMediaPanel({ initialMediaId }: { initialMediaId?: string | null }) {
  const [media, setMedia] = useState<MediaPreview | null>(
    initialMediaId ? { id: initialMediaId, url: null, name: 'Existing featured image' } : null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function upload(file: File | null) {
    if (!file) return;
    setError(null);
    const formData = new FormData();
    formData.append('file', file);
    startTransition(async () => {
      const result = await uploadBlogMediaAction(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setMedia({ id: result.data.id, url: result.data.publicUrl, name: file.name });
      if (inputRef.current) inputRef.current.value = '';
    });
  }

  return (
    <div className="space-y-3">
      <input type="hidden" name="featuredMediaId" value={media?.id ?? ''} readOnly />
      {media ? (
        <div className="border-border/70 overflow-hidden rounded-lg border">
          {media.url ? (
            <Image
              src={media.url}
              alt=""
              width={640}
              height={360}
              unoptimized
              className="aspect-video w-full object-cover"
            />
          ) : (
            <div className="bg-muted text-muted-foreground flex aspect-video items-center justify-center text-sm">
              Featured media set
            </div>
          )}
          <div className="flex items-center justify-between gap-2 p-2">
            <span className="text-muted-foreground truncate text-xs">{media.name ?? media.id}</span>
            <Button
              type="button"
              size="icon-xs"
              variant="ghost"
              onClick={() => setMedia(null)}
              aria-label="Remove featured image"
            >
              <X />
            </Button>
          </div>
        </div>
      ) : null}
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          disabled={isPending}
          onChange={(event) => upload(event.currentTarget.files?.[0] ?? null)}
        />
        <Button
          type="button"
          size="icon"
          variant="outline"
          disabled={isPending}
          onClick={() => inputRef.current?.click()}
          aria-label="Upload featured image"
        >
          {isPending ? <Loader2 className="animate-spin" /> : <ImagePlus />}
        </Button>
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
    </div>
  );
}
