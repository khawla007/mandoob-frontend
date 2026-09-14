type EvidenceOptions<T> = {
  nodeEnv?: string;
  mode?: string;
  fixture?: T;
};

function isDevelopmentEvidence(nodeEnv: string | undefined, mode: string | undefined) {
  return nodeEnv === 'development' && Boolean(mode);
}

export function isDevelopmentSourceUnavailableEvidence(options: {
  nodeEnv?: string;
  mode?: string;
  acceptedMode: string;
}): boolean {
  return options.nodeEnv === 'development' && options.mode === options.acceptedMode;
}

export function resolveAuthoritySourcePresentation(options: {
  authoritySlug: string;
  pageExists: boolean;
  nodeEnv?: string;
  mode?: string;
}):
  | { status: 'missing' | 'ready' }
  | { status: 'unavailable'; metadata: { title: string; description: string; canonical: string } } {
  if (!options.pageExists) return { status: 'missing' };
  if (
    options.authoritySlug === 'dmcc' &&
    isDevelopmentSourceUnavailableEvidence({
      nodeEnv: options.nodeEnv,
      mode: options.mode,
      acceptedMode: 'authority-source-unavailable',
    })
  ) {
    return {
      status: 'unavailable',
      metadata: {
        title: 'Authority guide unavailable',
        description: 'This authority setup guide is temporarily unavailable.',
        canonical: `/company-setup/${options.authoritySlug}`,
      },
    };
  }
  return { status: 'ready' };
}

export function isDevelopmentRouteErrorEvidence(options: {
  nodeEnv?: string;
  fixtureMode?: string;
  mode?: string;
}): boolean {
  return (
    options.nodeEnv === 'development' &&
    options.fixtureMode === 'fixture' &&
    options.mode === 'error'
  );
}

export function withDevelopmentCollectionEvidence<T, Args extends unknown[]>(
  load: (...args: Args) => Promise<T[]>,
  options: EvidenceOptions<T[]>,
) {
  if (!isDevelopmentEvidence(options.nodeEnv, options.mode)) return load;
  if (options.mode === 'empty') {
    const empty: (...args: Args) => Promise<T[]> = async () => [];
    return empty;
  }
  if (options.mode === 'unavailable') {
    const unavailable: (...args: Args) => Promise<T[]> = async () => {
      throw new Error('isolated development evidence');
    };
    return unavailable;
  }
  return load;
}

export function withDevelopmentItemEvidence<T, Args extends unknown[]>(
  load: (...args: Args) => Promise<T | null>,
  options: EvidenceOptions<T>,
) {
  if (!isDevelopmentEvidence(options.nodeEnv, options.mode)) return load;
  if (options.mode === 'fixture' && options.fixture !== undefined) {
    const fixture: (...args: Args) => Promise<T | null> = async () => options.fixture ?? null;
    return fixture;
  }
  if (options.mode === 'missing') {
    const missing: (...args: Args) => Promise<T | null> = async () => null;
    return missing;
  }
  if (options.mode === 'unavailable') {
    const unavailable: (...args: Args) => Promise<T | null> = async () => {
      throw new Error('isolated development evidence');
    };
    return unavailable;
  }
  return load;
}
