import { z } from 'zod';

import { RESERVED_PAGE_SLUGS, normalizePageSlug } from '@/lib/pages/slug';

export const PAGE_STATUSES = ['draft', 'scheduled', 'published', 'archived'] as const;
export const PAGE_ALIGNMENTS = ['left', 'center', 'right'] as const;

const hexColorSchema = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
const cssLengthToken = '(?:0|(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:px|rem|em|%|vh|vw)|auto)';
const cssLengthSchema = z.string().trim().regex(new RegExp(`^${cssLengthToken}$`));
const cssShorthandSchema = z.string().trim().regex(new RegExp(`^${cssLengthToken}(?:\\s+${cssLengthToken}){0,3}$`));
function isAbsoluteHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

const absoluteHttpUrlSchema = z.string().trim().refine(isAbsoluteHttpUrl, 'Must be an absolute HTTP(S) URL');
function hasUnsafeInternalPath(value: string): boolean {
  let candidate = value;
  for (let depth = 0; depth < 3; depth += 1) {
    if (candidate.startsWith('//') || /[\\\u0000-\u001f\u007f]/.test(candidate)) return true;
    try {
      const decoded = decodeURIComponent(candidate);
      if (decoded === candidate) return false;
      candidate = decoded;
    } catch {
      return true;
    }
  }
  return /%(?:2f|5c|0[0-9a-f]|7f)/i.test(candidate);
}

const buttonHrefSchema = z.string().trim().refine((value) => {
  if (isAbsoluteHttpUrl(value)) return true;
  if (!value.startsWith('/') || value.startsWith('//')) return false;
  if (hasUnsafeInternalPath(value)) return false;
  try {
    const parsed = new URL(value, 'https://cms.invalid');
    return parsed.origin === 'https://cms.invalid' && parsed.pathname.startsWith('/');
  } catch {
    return false;
  }
}, 'Button href must be a safe internal path or absolute HTTP(S) URL');

export const pageHeroSettingsSchema = z.object({
  backgroundColor: hexColorSchema.default('#ffffff'),
  overlayColor: hexColorSchema.default('#000000'),
  overlayOpacity: z.number().min(0).max(1).default(0),
  headingAlignment: z.enum(PAGE_ALIGNMENTS).default('center'),
  textAlignment: z.enum(PAGE_ALIGNMENTS).default('center'),
  buttonAlignment: z.enum(PAGE_ALIGNMENTS).default('center'),
  backgroundImageUrl: absoluteHttpUrlSchema.optional().nullable(),
  heading: z.string().trim().max(180).optional().nullable(),
  text: z.string().trim().max(1_000).optional().nullable(),
  buttonLabel: z.string().trim().max(80).optional().nullable(),
  buttonHref: buttonHrefSchema.optional().nullable(),
  minHeight: cssLengthSchema.optional(),
  maxWidth: cssLengthSchema.optional(),
  padding: cssShorthandSchema.optional(),
  margin: cssShorthandSchema.optional(),
});

const pageSlugSchema = z.string().trim().min(1).max(160)
  .refine((slug) => !RESERVED_PAGE_SLUGS.has(slug.toLowerCase()), 'Page slug is reserved')
  .transform(normalizePageSlug)
  .pipe(z.string().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/))
  .refine((slug) => !RESERVED_PAGE_SLUGS.has(slug), 'Page slug is reserved');

export const pageInputSchema = z.object({
  title: z.string().trim().min(1).max(180),
  slug: pageSlugSchema,
  contentJson: z.record(z.string(), z.unknown()).default({}),
  contentHtml: z.string().max(500_000).default(''),
  heroSettings: pageHeroSettingsSchema.optional(),
  status: z.enum(PAGE_STATUSES),
  publishedAt: z.string().datetime().optional().nullable(),
  scheduledFor: z.string().datetime().optional().nullable(),
  metaTitle: z.string().trim().max(70).optional().nullable(),
  metaDescription: z.string().trim().max(170).optional().nullable(),
  canonicalUrl: absoluteHttpUrlSchema.optional().nullable(),
  noindex: z.boolean().default(false),
  schemaMarkup: z.record(z.string(), z.unknown()).optional().nullable(),
  scriptHead: z.string().max(100_000).optional().nullable(),
  scriptBodyStart: z.string().max(100_000).optional().nullable(),
  scriptBodyEnd: z.string().max(100_000).optional().nullable(),
}).superRefine((value, ctx) => {
  if (value.status === 'published' && !value.publishedAt) {
    ctx.addIssue({ code: 'custom', path: ['publishedAt'], message: 'publishedAt is required when status is published' });
  }
  if (value.status === 'scheduled' && !value.scheduledFor) {
    ctx.addIssue({ code: 'custom', path: ['scheduledFor'], message: 'scheduledFor is required when status is scheduled' });
  }
});

export type PageStatus = (typeof PAGE_STATUSES)[number];
export type PageHeroSettings = z.infer<typeof pageHeroSettingsSchema>;
export type PageInput = z.input<typeof pageInputSchema>;
export type ParsedPageInput = z.infer<typeof pageInputSchema>;
