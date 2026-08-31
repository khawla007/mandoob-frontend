'use client';

import { useId, useState } from 'react';

type FaqItem = {
  question: string;
  answer: string;
};

type FaqAccordionProps = {
  items: FaqItem[];
};

export function FaqAccordion({ items }: FaqAccordionProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);
  const accordionId = useId();
  const indexedItems = items.map((item, index) => ({ ...item, index }));
  const columns = [
    indexedItems.filter(({ index }) => index % 2 === 0),
    indexedItems.filter(({ index }) => index % 2 === 1),
  ];

  return (
    <div className="home-faq__grid">
      {columns.map((column, columnIndex) => (
        <div className="home-faq__column" key={columnIndex}>
          {column.map(({ question, answer, index }) => {
            const isOpen = openIndex === index;
            const triggerId = `${accordionId}-trigger-${index}`;
            const answerId = `${accordionId}-answer-${index}`;

            return (
              <article
                className="home-faq__item"
                data-open={isOpen ? '' : undefined}
                key={triggerId}
                style={{ order: index }}
              >
                <h4>
                  <button
                    className="home-faq__trigger"
                    type="button"
                    id={triggerId}
                    aria-expanded={isOpen}
                    aria-controls={answerId}
                    onClick={() => setOpenIndex((current) => (current === index ? null : index))}
                  >
                    <span>{question}</span>
                    <span className="home-faq__indicator" aria-hidden="true" />
                  </button>
                </h4>
                <div
                  id={answerId}
                  className="home-faq__answer"
                  role="region"
                  aria-labelledby={triggerId}
                  aria-hidden={!isOpen}
                >
                  <div className="home-faq__answer-inner">
                    <p>{answer}</p>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      ))}
    </div>
  );
}
