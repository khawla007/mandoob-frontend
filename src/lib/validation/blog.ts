import { z } from 'zod';

import { normalizeBlogSlug } from '@/lib/blog/slug';

export const BLOG_STATUSES = ['draft', 'scheduled', 'published', 'archived'] as const;
export const BLOG_TERM_KINDS = ['category', 'attribute', 'tag'] as const;
export const BLOG_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/avif'] as const;

export const MAX_FEATURED_IMAGE_BYTES = 5 * 1024 * 1024;
export const MAX_GALLERY_IMAGE_BYTES = 8 * 1024 * 1024;
export const MAX_GALLERY_IMAGES = 30;

export type BlogPostStatus = (typeof BLOG_STATUSES)[number];
export type BlogTermKind = (typeof BLOG_TERM_KINDS)[number];

export const blogSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(160)
  .transform(normalizeBlogSlug)
  .pipe(z.string().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/));

export const blogPostInputSchema = z.object({
  title: z.string().trim().min(1).max(180),
  slug: blogSlugSchema,
  excerpt: z.string().trim().max(320).optional().nullable(),
  contentJson: z.record(z.string(), z.unknown()).default({}),
  contentHtml: z.string().max(500_000).default(''),
  status: z.enum(BLOG_STATUSES),
  publishedAt: z.string().datetime().optional().nullable(),
  scheduledFor: z.string().datetime().optional().nullable(),
  featuredMediaId: z.string().uuid().optional().nullable(),
  metaTitle: z.string().trim().max(70).optional().nullable(),
  metaDescription: z.string().trim().max(170).optional().nullable(),
  canonicalUrl: z.string().url().optional().nullable(),
  noindex: z.boolean().default(false),
  termIds: z.array(z.string().uuid()).default([]),
  galleryMediaIds: z.array(z.string().uuid()).max(MAX_GALLERY_IMAGES).default([]),
}).superRefine((value, ctx) => {
  if (value.status === 'published') {
    if (!value.publishedAt) {
      ctx.addIssue({
        code: 'custom',
        path: ['publishedAt'],
        message: 'publishedAt is required when status is published',
      });
    }
    if (value.scheduledFor) {
      ctx.addIssue({
        code: 'custom',
        path: ['scheduledFor'],
        message: 'scheduledFor must be empty when status is published',
      });
    }
  }

  if (value.status === 'scheduled' && !value.scheduledFor) {
    ctx.addIssue({
      code: 'custom',
      path: ['scheduledFor'],
      message: 'scheduledFor is required when status is scheduled',
    });
  }

  if (new Set(value.termIds).size !== value.termIds.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['termIds'],
      message: 'termIds must be unique',
    });
  }

  if (new Set(value.galleryMediaIds).size !== value.galleryMediaIds.length) {
    ctx.addIssue({
      code: 'custom',
      path: ['galleryMediaIds'],
      message: 'galleryMediaIds must be unique',
    });
  }
});

export const blogTermInputSchema = z.object({
  kind: z.enum(BLOG_TERM_KINDS),
  name: z.string().trim().min(1).max(80),
  slug: blogSlugSchema,
  description: z.string().trim().max(240).optional().nullable(),
  parentId: z.string().uuid().optional().nullable(),
  sortOrder: z.coerce.number().int().min(0).max(10_000).default(0),
});

export type BlogPostInput = z.input<typeof blogPostInputSchema>;
export type ParsedBlogPostInput = z.infer<typeof blogPostInputSchema>;
export type BlogTermInput = z.input<typeof blogTermInputSchema>;
export type ParsedBlogTermInput = z.infer<typeof blogTermInputSchema>;
