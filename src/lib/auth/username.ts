import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

const USERNAME_RE = /^[a-z0-9_]{3,30}$/;
const MAX_BASE_LEN = 24;
const FALLBACK_BASE = 'user';

export function slugifyName(fullName: string): string {
  const slug = fullName
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .replace(/_+/g, '_');
  const base = slug.length >= 3 ? slug : FALLBACK_BASE;
  return base.slice(0, MAX_BASE_LEN);
}

function randomSuffix(width: number): string {
  const min = 10 ** (width - 1);
  const span = 10 ** width - min;
  return String(min + Math.floor(Math.random() * span));
}

export async function generateUniqueUsername(
  admin: SupabaseClient,
  fullName: string,
): Promise<string> {
  const base = slugifyName(fullName);
  for (let attempt = 0; attempt < 8; attempt++) {
    const width = attempt < 4 ? 3 : 4;
    const candidate = `${base}_${randomSuffix(width)}`;
    if (!USERNAME_RE.test(candidate)) continue;
    const { count, error } = await admin
      .from('profiles')
      .select('id', { head: true, count: 'exact' })
      .eq('username', candidate);
    if (error) throw new Error(`username lookup failed: ${error.message}`);
    if ((count ?? 0) === 0) return candidate;
  }
  throw new Error('Could not generate a unique username after 8 attempts');
}
