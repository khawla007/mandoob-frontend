export function QuestionnaireBuilderUnavailable({ labels }: { labels: Record<string, string> }) {
  const fields = [
    labels.questionType,
    labels.label,
    labels.help,
    labels.required,
    labels.options,
    labels.validation,
    labels.conditional,
    labels.consent,
  ];
  const states = [
    labels.dirty,
    labels.validating,
    labels.pending,
    labels.success,
    labels.conflict,
    labels.unavailable,
    labels.error,
  ];
  const actions = [
    labels.add,
    labels.reorder,
    labels.edit,
    labels.duplicate,
    labels.archive,
    labels.preview,
    labels.publish,
  ];

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(16rem,0.72fr)_minmax(0,1.28fr)]">
      <aside className="border-border bg-card min-w-0 rounded-xl border p-5">
        <h2 className="text-lg font-semibold">{labels.sections}</h2>
        <p className="text-muted-foreground mt-2 text-sm leading-6">{labels.sectionsDescription}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          {states.map((state) => (
            <span
              key={state}
              className="border-border bg-muted rounded-full border px-2.5 py-1 text-xs"
            >
              {state}
            </span>
          ))}
        </div>
      </aside>
      <section className="border-border bg-card min-w-0 rounded-xl border p-5">
        <h2 className="text-lg font-semibold">{labels.questionEditor}</h2>
        <p className="text-muted-foreground mt-2 text-sm leading-6">{labels.editorDescription}</p>
        <div className="mt-5 grid gap-3 sm:grid-cols-2">
          {fields.map((field) => (
            <div key={field} className="border-border bg-muted/40 rounded-lg border p-3 text-sm">
              {field}
            </div>
          ))}
        </div>
        <div
          className="mt-5 flex flex-wrap gap-2"
          aria-describedby="questionnaire-action-dependency"
        >
          {actions.map((action) => (
            <button
              key={action}
              type="button"
              disabled
              className="border-border text-muted-foreground min-h-10 rounded-md border px-3 text-sm disabled:cursor-not-allowed disabled:opacity-70"
            >
              {action}
            </button>
          ))}
        </div>
        <p id="questionnaire-action-dependency" className="text-muted-foreground mt-3 text-xs">
          {labels.actionExplanation}
        </p>
      </section>
    </div>
  );
}
