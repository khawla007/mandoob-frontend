// Plain UUID v1–8 regex used at non-Zod call sites (router params, header
// inputs, decoded cursor payloads). Schemas continue to use `z.string().uuid()`.
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}
