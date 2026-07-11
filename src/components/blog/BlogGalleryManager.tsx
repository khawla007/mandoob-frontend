'use client';

import Image from 'next/image';
import { useRef, useState, useTransition } from 'react';
import { ArrowDown, ArrowUp, ImagePlus, Loader2, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { uploadBlogMediaAction } from '@/app/admin/blog/actions';

type GalleryItem = {
  id: string;
  url: string | null;
  name: string | null;
};

function moveItem(items: GalleryItem[], from: number, to: number): GalleryItem[] {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(from, 1);
  if (!item) return items;
  next.splice(to, 0, item);
  return next;
}

export function BlogGalleryManager({ initialMediaIds = [] }: { initialMediaIds?: string[] }) {
  const [items, setItems] = useState<GalleryItem[]>(
    initialMediaIds.map((id) => ({ id, url: null, name: 'Existing gallery image' })),
  );
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);

  function upload(files: FileList | null) {
    const file = files?.[0];
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
      setItems((current) => [
        ...current,
        { id: result.data.id, url: result.data.publicUrl, name: file.name },
      ]);
      if (inputRef.current) inputRef.current.value = '';
    });
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <input key={item.id} type="hidden" name="galleryMediaIds" value={item.id} readOnly />
      ))}
      <div className="flex items-center gap-2">
        <Input
          ref={inputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          disabled={isPending}
          onChange={(event) => upload(event.currentTarget.files)}
        />
        <Button
          type="button"
          size="icon"
          variant="outline"
          disabled={isPending}
          onClick={() => inputRef.current?.click()}
          aria-label="Upload gallery image"
        >
          {isPending ? <Loader2 className="animate-spin" /> : <ImagePlus />}
        </Button>
      </div>
      {error ? <p className="text-destructive text-xs">{error}</p> : null}
      {items.length === 0 ? (
        <div className="border-border/70 text-muted-foreground rounded-lg border border-dashed p-6 text-center text-sm">
          No gallery images yet.
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((item, index) => (
            <div key={item.id} className="border-border/70 overflow-hidden rounded-lg border">
              {item.url ? (
                <Image
                  src={item.url}
                  alt=""
                  width={360}
                  height={240}
                  unoptimized
                  className="aspect-[3/2] w-full object-cover"
                />
              ) : (
                <div className="bg-muted text-muted-foreground flex aspect-[3/2] items-center justify-center text-xs">
                  Gallery media set
                </div>
              )}
              <div className="space-y-2 p-2">
                <div className="text-muted-foreground truncate text-xs">{item.name ?? item.id}</div>
                <div className="flex justify-between gap-1">
                  <div className="flex gap-1">
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      disabled={index === 0}
                      onClick={() => setItems((current) => moveItem(current, index, index - 1))}
                      aria-label="Move image up"
                    >
                      <ArrowUp />
                    </Button>
                    <Button
                      type="button"
                      size="icon-xs"
                      variant="ghost"
                      disabled={index === items.length - 1}
                      onClick={() => setItems((current) => moveItem(current, index, index + 1))}
                      aria-label="Move image down"
                    >
                      <ArrowDown />
                    </Button>
                  </div>
                  <Button
                    type="button"
                    size="icon-xs"
                    variant="ghost"
                    onClick={() =>
                      setItems((current) => current.filter((row) => row.id !== item.id))
                    }
                    aria-label="Remove image"
                  >
                    <X />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
