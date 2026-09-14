export function serializeJsonLd(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function hasJsonLdContent(
  value: Record<string, unknown> | null,
): value is Record<string, unknown> {
  return value !== null && Object.keys(value).length > 0;
}
