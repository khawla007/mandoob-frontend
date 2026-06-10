export function TrustBandSection() {
  return (
    <section className="trust-band" aria-labelledby="trust-h">
      <h2 id="trust-h" className="visually-hidden">
        Free zones and authorities supported
      </h2>
      <div className="logo-band">
        <div className="logo-track" aria-hidden="true">
          {[0, 1].map((half) =>
            ['DMCC', 'IFZA', 'SHAMS', 'RAKEZ', 'JAFZA', 'ADGM', 'DAFZA', 'RAK ICC'].map((zone) => (
              <span key={`${half}-${zone}`}>{zone}</span>
            )),
          )}
        </div>
      </div>
    </section>
  );
}
