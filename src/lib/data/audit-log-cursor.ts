export type Cursor = { ts: string; id: string };

export function encodeCursor(c: Cursor): string {
  return Buffer.from(`${c.ts}|${c.id}`).toString('base64url');
}

export function decodeCursor(raw: string | null | undefined): Cursor | null {
  if (!raw) return null;
  try {
    const decoded = Buffer.from(raw, 'base64url').toString('utf8');
    const [ts, id] = decoded.split('|');
    if (!ts || !id) return null;
    return { ts, id };
  } catch {
    return null;
  }
}
