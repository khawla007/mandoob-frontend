const providers = [
  { id: 'google', mark: 'G' },
  { id: 'microsoft', mark: 'M' },
  { id: 'apple', mark: 'A' },
] as const;

export type AuthProviderLabels = {
  heading: string;
  unavailableDescription: string;
  listLabel: string;
  providerUnavailableLabel: (provider: string) => string;
  unavailable: string;
  google: string;
  microsoft: string;
  apple: string;
};

export function AuthProviders({ labels }: { labels: AuthProviderLabels }) {
  return (
    <section className="auth-providers" aria-labelledby="auth-provider-heading">
      <div className="auth-providers__divider">
        <span id="auth-provider-heading">{labels.heading}</span>
      </div>
      <p className="auth-providers__notice" role="status">
        {labels.unavailableDescription}
      </p>
      <ul className="auth-providers__list" aria-label={labels.listLabel}>
        {providers.map((provider) => (
          <li key={provider.id}>
            <div
              className="auth-provider"
              role="group"
              aria-label={labels.providerUnavailableLabel(labels[provider.id])}
              aria-disabled="true"
            >
              <span className="auth-provider__mark" aria-hidden="true">
                {provider.mark}
              </span>
              <span>{labels[provider.id]}</span>
              <span className="auth-provider__state">{labels.unavailable}</span>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
