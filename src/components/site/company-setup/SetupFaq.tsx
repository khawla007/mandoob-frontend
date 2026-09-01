export type SetupFaqItem = { question: string; answer: string };

export function SetupFaq({
  headingId,
  title,
  items,
}: {
  headingId: string;
  title: string;
  items: readonly SetupFaqItem[];
}) {
  return (
    <div className="container setup-faq__inner" aria-labelledby={headingId}>
      <header className="setup-section-heading setup-section-heading--centered">
        <h2 id={headingId}>{title}</h2>
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
