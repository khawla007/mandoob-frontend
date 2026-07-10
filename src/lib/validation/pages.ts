import { z } from 'zod';

import { normalizePageSlug } from '@/lib/pages/slug';

export const PAGE_STATUSES = ['draft', 'scheduled', 'published', 'archived'] as const;
export const PAGE_ALIGNMENTS = ['left', 'center', 'right'] as const;

const hexColorSchema = z.string().regex(/^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/);
const cssLengthToken = '(?:0|(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:px|rem|em|%|vh|vw)|auto)';
const cssLengthSchema = z.string().trim().regex(new RegExp(`^${cssLengthToken}$`));
const cssShorthandSchema = z.string().trim().regex(new RegExp(`^${cssLengthToken}(?:\\s+${cssLengthToken}){0,3}$`));
const buttonHrefSchema = z.string().trim().refine((value) => {
  if (value.startsWith('/') && !value.startsWith('//')) return true;
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}, 'Button href must be an internal path or absolute HTTP(S) URL');

export const pageHeroSettingsSchema = z.object({
  backgroundColor: hexColorSchema.default('#ffffff'),
  overlayColor: hexColorSchema.default('#000000'),
  overlayOpacity: z.number().min(0).max(1).default(0),
  headingAlignment: z.enum(PAGE_ALIGNMENTS).default('center'),
  textAlignment: z.enum(PAGE_ALIGNMENTS).default('center'),
  buttonAlignment: z.enum(PAGE_ALIGNMENTS).default('center'),
  backgroundImageUrl: z.string().url().optional().nullable(),
  heading: z.string().trim().max(180).optional().nullable(),
  text: z.string().trim().max(1_000).optional().nullable(),
  buttonLabel: z.string().trim().max(80).optional().nullable(),
  buttonHref: buttonHrefSchema.optional().nullable(),
  minHeight: cssLengthSchema.optional(),
  maxWidth: cssLengthSchema.optional(),
  padding: cssShorthandSchema.optional(),
  margin: cssShorthandSchema.optional(),
});

const pageSlugSchema = z.string().trim().min(1).max(160).transform(normalizePageSlug)
  .pipe(z.string().min(1).max(120).regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/));

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
  canonicalUrl: z.string().url().optional().nullable(),
  noindex: z.boolean().default(false),
  schemaMarkup: z.record(z.string(), z.unknown()).optional().nullable(),
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
