'use client';

import Image from 'next/image';
import { ImagePlus, Loader2, X } from 'lucide-react';
import { useRef, useState, useTransition } from 'react';
import { uploadBlogMediaAction } from '@/app/admin/blog/actions';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

export type HeroMedia = { id: string | null; previewUrl: string | null };

export function PageHeroMediaPicker({ media, onChange }: { media: HeroMedia; onChange: (media: HeroMedia) => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  function upload(file: File | null) {
    if (!file) return;
    setError(null);
    const data = new FormData(); data.append('file', file);
    startTransition(async () => {
      const result = await uploadBlogMediaAction(data);
      if (!result.ok) { setError(result.error); return; }
      onChange({ id: result.data.id, previewUrl: result.data.publicUrl });
      if (inputRef.current) inputRef.current.value = '';
    });
  }
  return <div className="space-y-3">
    {media.previewUrl ? <div className="relative overflow-hidden rounded-lg border bg-muted">
      <Image src={media.previewUrl} alt="Hero background preview" width={960} height={480} unoptimized className="aspect-[2/1] w-full object-cover" />
      <Button type="button" variant="secondary" size="icon-sm" className="absolute right-2 top-2" aria-label="Remove hero background image" onClick={() => onChange({ id: null, previewUrl: null })}><X /></Button>
    </div> : null}
    <div className="flex gap-2"><Input ref={inputRef} aria-label="Hero background image" type="file" accept="image/jpeg,image/png,image/webp,image/avif" disabled={pending} onChange={(e) => upload(e.currentTarget.files?.[0] ?? null)} />
      <Button type="button" variant="outline" size="icon" disabled={pending} aria-label="Upload hero background image" onClick={() => inputRef.current?.click()}>{pending ? <Loader2 className="animate-spin" /> : <ImagePlus />}</Button></div>
    {error ? <p role="alert" className="text-destructive text-xs">{error}</p> : null}
  </div>;
}
