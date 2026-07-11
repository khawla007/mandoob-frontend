import { BLOG_IMAGE_MIMES, MAX_GALLERY_IMAGE_BYTES } from '@/lib/validation/blog';

export type HeroUploadFile = { name: string; type: string; size: number };
type UploadResult = { ok: true; data: { id: string; publicUrl: string } } | { ok: false; error: string };

export function validateHeroUpload(file: HeroUploadFile | null): string | null {
  if (!file) return 'Choose an image to upload.';
  if (!(BLOG_IMAGE_MIMES as readonly string[]).includes(file.type)) return 'Use a JPEG, PNG, WebP, or AVIF image.';
  if (file.size > MAX_GALLERY_IMAGE_BYTES) return 'Hero image must be 8 MiB or smaller.';
  return null;
}

export async function runHeroUpload(file: HeroUploadFile | null, upload: (file: HeroUploadFile) => Promise<UploadResult>): Promise<UploadResult> {
  const validationError = validateHeroUpload(file);
  if (validationError || !file) return { ok: false, error: validationError ?? 'Choose an image to upload.' };
  try {
    return await upload(file);
  } catch {
    return { ok: false, error: 'Upload failed before the server could process it. Please try again.' };
  }
}
