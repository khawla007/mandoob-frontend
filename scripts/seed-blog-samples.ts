import fs from 'node:fs';
import path from 'node:path';

import { createClient } from '@supabase/supabase-js';

type Env = Record<string, string | undefined>;

function readLocalEnv(): Env {
  const envPath = path.join(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) {
    return {};
  }

  return Object.fromEntries(
    fs
      .readFileSync(envPath, 'utf8')
      .split(/\r?\n/)
      .filter((line) => line && !line.trimStart().startsWith('#') && line.includes('='))
      .map((line) => {
        const index = line.indexOf('=');
        return [
          line.slice(0, index).trim(),
          line
            .slice(index + 1)
            .trim()
            .replace(/^['"]|['"]$/g, ''),
        ];
      }),
  );
}

const env = { ...readLocalEnv(), ...process.env };
const supabaseUrl = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { persistSession: false },
});

const titles = [
  'Mainland license renewal checklist for 2026',
  'Free zone setup decisions before reserving a name',
  'How UAE visa quotas affect early hiring plans',
  'Corporate tax registration notes for new entities',
  'Bank account readiness for first-time founders',
  'Trade name approval issues teams can avoid',
  'Document attestation flow for foreign shareholders',
  'When to update a company activity list',
  'Operational notes for Ejari and office leases',
  'License amendment timing for growing companies',
  'Preparing compliance files before renewal season',
  'PRO handoff checklist for investor visa work',
  'How establishment cards fit the setup timeline',
  'Common delays in medical and Emirates ID steps',
  'Choosing between consultant and commercial activities',
];

const basePublishedAt = new Date('2026-07-01T09:00:00.000Z');

async function main() {
  const rows = titles.map((title, index) => {
    const number = index + 1;
    const slug = `sample-blog-${String(number).padStart(2, '0')}`;
    const publishedAt = new Date(basePublishedAt.getTime() - index * 60 * 60 * 1000).toISOString();
    const contentText = `${title}. This sample post validates the public Blog card layout and pagination behavior.`;

    return {
      slug,
      title,
      excerpt: `Sample public blog post ${number} for validating the four-column grid, three-row page size, and pagination controls.`,
      content_json: {
        type: 'doc',
        content: [{ type: 'paragraph', content: [{ type: 'text', text: contentText }] }],
      },
      content_html: `<p>${contentText}</p>`,
      status: 'published',
      published_at: publishedAt,
      scheduled_for: null,
      meta_title: title,
      meta_description: `Sample public blog post ${number} for Blog pagination QA.`,
      noindex: false,
      deleted_at: null,
    };
  });

  for (const row of rows) {
    const { data: existing, error: readError } = await supabase
      .from('blog_posts')
      .select('id')
      .eq('slug', row.slug)
      .maybeSingle();

    if (readError) {
      throw readError;
    }

    const mutation = existing
      ? supabase.from('blog_posts').update(row).eq('id', existing.id)
      : supabase.from('blog_posts').insert(row);
    const { error } = await mutation;

    if (error) {
      throw error;
    }
  }

  const { count, error } = await supabase
    .from('blog_posts')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'published')
    .is('deleted_at', null);

  if (error) {
    throw error;
  }

  console.log(`Seeded ${rows.length} sample blog posts. Published posts: ${count ?? 'unknown'}.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
