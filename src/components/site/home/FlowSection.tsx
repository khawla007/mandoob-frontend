import { SplitImageContent } from '@/components/site/SplitImageContent';

export function FlowSection() {
  return (
    <section id="flow" className="section" aria-labelledby="flow-h">
      <div className="container">
        <SplitImageContent
          mediaTone="soft"
          media={
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="https://illustrations.popsy.co/orange/digital-nomad.svg"
              alt="Illustration of a founder running UAE company setup remotely as a digital nomad"
              className="split-showcase__illust"
              loading="lazy"
              decoding="async"
            />
          }
        >
          <span className="eyebrow">03 · How it works</span>
          <h2 id="flow-h" className="h2">
            From idea to trade license in 7–14 days.
          </h2>
          <span className="split-showcase__eyebrow">Four steps, fully tracked</span>
          <h3 className="split-showcase__title">
            Submit once. We carry it from estimate to license.
          </h3>
          <ol className="split-showcase__list split-showcase__list--steps">
            <li>
              <span className="flow__num mono" aria-hidden="true">
                01
              </span>
              <h3>Submit</h3>
              <p>10-minute dynamic questionnaire, branched by ownership and activity.</p>
            </li>
            <li>
              <span className="flow__num mono" aria-hidden="true">
                02
              </span>
              <h3>Estimate</h3>
              <p>Itemized AED quote across DED, free zone, MOHRE, GDRFA, ICP, PRO.</p>
            </li>
            <li>
              <span className="flow__num mono" aria-hidden="true">
                03
              </span>
              <h3>Onboard</h3>
              <p>A licensed PRO firm picks up your file. Shared dashboard, signed docs.</p>
            </li>
            <li>
              <span className="flow__num mono" aria-hidden="true">
                04
              </span>
              <h3>Operate</h3>
              <p>License, visas, Emirates ID, renewals, tracked to the day.</p>
            </li>
          </ol>
        </SplitImageContent>
      </div>
    </section>
  );
}
