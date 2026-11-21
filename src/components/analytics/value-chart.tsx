import { formatEuro } from "@/domain/money";
import type { ValueBucket } from "@/domain/analytics";

/** Grouped columns, sent (soft) and accepted (brand). Plain SVG, no animation. */
export function ValueChart({ buckets }: { buckets: ValueBucket[] }) {
  const max = Math.max(1, ...buckets.flatMap((b) => [b.sentCents, b.acceptedCents]));
  const empty = buckets.every((b) => b.sentCents === 0 && b.acceptedCents === 0);
  const step = Math.max(1, Math.ceil(buckets.length / 8));
  return (
    <figure className="an-chart">
      <div className="an-chart-legend" aria-hidden="true">
        <span><i className="is-sent" /> Inviato</span>
        <span><i className="is-accepted" /> Accettato</span>
      </div>
      <div className="an-chart-plot" role="img" aria-label={empty ? "Nessun valore nel periodo" : `Valore massimo per intervallo ${formatEuro(max)}`}>
        {buckets.map((b, i) => (
          <div key={i} className="an-chart-col" title={`${b.label}: inviato ${formatEuro(b.sentCents)}, accettato ${formatEuro(b.acceptedCents)}`}>
            <div className="an-chart-bars">
              <span className="is-sent" style={{ height: `${(b.sentCents / max) * 100}%` }} />
              <span className="is-accepted" style={{ height: `${(b.acceptedCents / max) * 100}%` }} />
            </div>
            <span className="an-chart-x">{i % step === 0 ? b.label : ""}</span>
          </div>
        ))}
      </div>
    </figure>
  );
}
