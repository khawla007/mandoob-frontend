export function headingAnchor(value: string): string {
  const anchor = value
    .trim()
    .toLocaleLowerCase('en')
    .replace(/&/g, ' and ')
    .replace(/<[^>]*>/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return anchor || 'section';
}

export function shouldShowTableOfContents(headings: readonly string[]): boolean {
  return headings.length >= 3;
}
