export type DocumentPopup = {
  opener: unknown;
  location: { replace(url: string): void };
  close(): void;
};

type OpenResult = { ok: true; url: string } | { ok: false; messageKey: string };

export async function openDocumentVersionWithPopup({
  openPopup,
  loadUrl,
  onBlocked,
  onFailure,
}: {
  openPopup(): DocumentPopup | null;
  loadUrl(): Promise<OpenResult>;
  onBlocked(): void;
  onFailure(messageKey: string): void;
}): Promise<'blocked' | 'opened' | 'failed'> {
  const popup = openPopup();
  if (!popup) {
    onBlocked();
    return 'blocked';
  }
  popup.opener = null;

  try {
    const result = await loadUrl();
    if (result.ok) {
      popup.location.replace(result.url);
      return 'opened';
    }
    popup.close();
    onFailure(result.messageKey);
  } catch {
    popup.close();
    onFailure('documents.errors.unexpected');
  }
  return 'failed';
}
