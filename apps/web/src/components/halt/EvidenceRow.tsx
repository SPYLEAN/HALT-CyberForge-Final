import { cx } from "./cx";

export interface EvidenceRowProps {
  id: string;
  source: string;
  text: string;
  time: string;
  supports?: string;
  href?: string;
  inferred?: boolean;
}

export function EvidenceRow({ id, source, text, time, supports, href, inferred }: EvidenceRowProps) {
  return (
    <div className={cx("halt-ev", inferred && "halt-ev-inferred")} role="row">
      <div className="id" role="cell">
        <span className="halt-ev-marker" aria-hidden />
        <a href={href ?? `#${id}`}>{id}</a>
      </div>
      <div className="src" role="cell">
        {source}
      </div>
      <div className="txt" role="cell">
        {text}
      </div>
      <div className="t" role="cell">
        {time}
      </div>
      <div className="sup" role="cell">
        {supports}
      </div>
    </div>
  );
}
