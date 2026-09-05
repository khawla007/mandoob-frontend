export function PublicContentLoading() {
  return (
    <section
      className="public-content-state public-content-loading"
      role="status"
      aria-live="polite"
    >
      <div className="public-content-state__inner container">
        <span className="eyebrow">Loading</span>
        <h1>Preparing this page</h1>
        <p>We are retrieving the latest published content.</p>
        <div className="public-content-loading__lines" aria-hidden="true">
          <span />
          <span />
          <span />
        </div>
      </div>
    </section>
  );
}
