export type SetupFaqItem = { question: string; answer: string };

export function SetupFaq({
  headingId,
  title,
  items,
  eyebrow,
  lede,
}: {
  headingId: string;
  title: string;
  items: readonly SetupFaqItem[];
  eyebrow?: string;
  lede?: string;
}) {
  return (
    <div className="setup-faq__inner container" aria-labelledby={headingId}>
      <header className="setup-section-heading setup-section-heading--centered">
        {eyebrow ? <span className="eyebrow eyebrow--accent">{eyebrow}</span> : null}
        <h2 id={headingId}>{title}</h2>
        {lede ? <p>{lede}</p> : null}
      </header>
      <div className="setup-faq__grid">
        {items.map((item) => (
          <details key={item.question} className="setup-faq__item">
            <summary>{item.question}</summary>
            <p>{item.answer}</p>
          </details>
        ))}
      </div>
    </div>
  );
}
