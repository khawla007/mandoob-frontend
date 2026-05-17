export function uploadErrorMessage(code: string, error: string): string {
  if (code === 'SCANNER_UNAVAILABLE') {
    return 'SCANNER_UNAVAILABLE: Security scanning is temporarily unavailable. Try again in a few minutes.';
  }

  return `${code}: ${error}`;
}
