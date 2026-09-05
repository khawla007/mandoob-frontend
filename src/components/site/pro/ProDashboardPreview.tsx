import { PUBLIC_PRO_CONTENT } from '@/lib/pro/public-pro';

export function ProDashboardPreview() {
  const { label, description, dashboard } = PUBLIC_PRO_CONTENT.preview;

  return (
    <figure
      className="frame frame--pro reveal"
      aria-labelledby="pro-preview-label"
      aria-describedby="pro-preview-description"
      data-preview-interaction="none"
    >
      <figcaption className="frame__bar">
        <span
          id="pro-preview-label"
          className="frame__title mono"
          data-source-state={label.source.state}
        >
          {label.text}
        </span>
        <span className="frame__meta mono">Noninteractive</span>
      </figcaption>
      <p id="pro-preview-description" className="frame__description">
        {description.text}
      </p>
      <div className="frame__body">
        <aside className="fside fside--pro" aria-label={dashboard.title.text}>
          <p className="fside__title mono">{dashboard.title.text}</p>
          <ul>
            {dashboard.navigation.map((item, index) => (
              <li key={item.text} className={index === 0 ? 'is-active' : undefined}>
                <span className="fside__label">{item.text}</span>
              </li>
            ))}
          </ul>
          <p className="fside__unavailable" data-source-state={dashboard.interaction.source.state}>
            {dashboard.interaction.text}
          </p>
        </aside>
        <div className="fmain">
          <dl className="fkpis">
            {dashboard.slots.map((slot) => (
              <div key={slot.label.text}>
                <dt className="fkpiL mono">{slot.label.text}</dt>
                <dd className="fkpiV mono" data-source-state={slot.value.source.state}>
                  {slot.value.text}
                </dd>
              </div>
            ))}
          </dl>
          <div className="ffeed">
            <p className="ffeedT mono">Workspace areas</p>
            <ul>
              {dashboard.areas.map((area) => (
                <li key={area.label.text}>
                  <span className="ffeed__label">{area.label.text}</span>
                  <span className="mono ffeed__meta" data-source-state={area.state.source.state}>
                    {area.state.text}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    </figure>
  );
}
