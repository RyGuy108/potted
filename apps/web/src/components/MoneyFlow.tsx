import { Icon, type IconName } from "@/components/Icon";
import "./MoneyFlow.css";

export interface MoneyStop {
  icon: IconName;
  title: string;
  text: string;
}

export interface MoneyOutcome {
  icon: IconName;
  title: string;
  text: string;
  tone: "paid" | "refund";
}

/** A gentle arc from one stop to the next: sideways on wide screens, downwards on phones. */
function Link() {
  return (
    <div className="flow-link" aria-hidden="true">
      <svg className="flow-h" width="64" height="40" viewBox="0 0 64 40">
        <path className="flow-path" d="M4 26 C 20 6, 44 6, 58 24" />
        <path className="flow-head" d="M51 22.5 L59 25 L57.5 16.8" />
      </svg>
      <svg className="flow-v" width="40" height="44" viewBox="0 0 40 44">
        <path className="flow-path" d="M20 3 C 6 14, 34 26, 20 39" />
        <path className="flow-head" d="M14.5 34 L20 40.5 L25 34" />
      </svg>
    </div>
  );
}

/** Where the result node forks: up to the payout, down to the refund. */
function Branch() {
  return (
    <div className="flow-branch" aria-hidden="true">
      {/* Wide: the outcomes sit one above the other, centred 52px from each edge of a 208px column. */}
      <svg className="flow-h" width="76" height="208" viewBox="0 0 76 208">
        <path className="flow-path" d="M4 104 C 30 104, 34 52, 68 52" />
        <path className="flow-head" d="M61 46.5 L69 52 L61 57.5" />
        <path className="flow-path flow-path-alt" d="M4 104 C 30 104, 34 156, 68 156" />
        <path className="flow-head flow-head-alt" d="M61 150.5 L69 156 L61 161.5" />
        <circle className="flow-fork" cx="5" cy="104" r="3.5" />
      </svg>
      {/* Phones: the outcomes sit side by side, so the fork splits left and right. */}
      <svg className="flow-v" viewBox="0 0 200 48" preserveAspectRatio="none">
        <path className="flow-path" d="M100 2 C 100 26, 50 22, 50 46" vectorEffect="non-scaling-stroke" />
        <path className="flow-path flow-path-alt" d="M100 2 C 100 26, 150 22, 150 46" vectorEffect="non-scaling-stroke" />
      </svg>
    </div>
  );
}

/**
 * Where a dollar goes, drawn as a small map: three stops joined by arrows,
 * then a fork to the streamer or back to the planters.
 */
export function MoneyFlow({ stops, end, outcomes }: { stops: MoneyStop[]; end: { title: string }; outcomes: [MoneyOutcome, MoneyOutcome] }) {
  return (
    <div className="flow" role="list" aria-label="Where the money goes">
      {stops.map((stop, i) => (
        <div key={stop.title} className="flow-stop-wrap">
          <div role="listitem" className={`flow-stop${i === 1 ? " flow-stop-key" : ""}`}>
            <span className="flow-icon">
              <Icon name={stop.icon} size={18} />
            </span>
            <span className="flow-no mono">0{i + 1}</span>
            <strong>{stop.title}</strong>
            <span className="muted small">{stop.text}</span>
          </div>
          {i < stops.length - 1 ? <Link /> : <Branch />}
        </div>
      ))}
      <div role="listitem" className="flow-end">
        <span className="flow-end-label mono">
          0{stops.length + 1} · {end.title}
        </span>
        <div className="flow-outcomes">
          {outcomes.map((o) => (
            <div key={o.title} className={`flow-outcome flow-${o.tone}`}>
              <span className="flow-icon">
                <Icon name={o.icon} size={16} />
              </span>
              <span>
                <strong>{o.title}</strong>
                <span className="muted small">{o.text}</span>
              </span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
