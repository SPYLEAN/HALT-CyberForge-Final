// The ten presentation beats for one real run. Each figure is read from that run's API responses. A beat with
// nothing to show says so, and no figure is ever authored here.
import { formatBytes, formatCount, type DatasetRun, type IncidentDetail, type IncidentList, type ReachabilityResult } from "./api";

export interface Beat {
  id: string;
  kicker: string;
  title: string;
  figure: string;
  body: string;
  showGraph?: boolean;
}

export function buildBeats(run: DatasetRun, list: IncidentList, top: IncidentDetail | null, reach: ReachabilityResult | null): Beat[] {
  const m = run.metrics;
  const q = list.quality;
  const gaps = top?.evidence_gaps ?? [];
  return [
    {
      id: "raw",
      kicker: "01 RAW EVENTS",
      title: "A log is a pile of disconnected events",
      figure: `${formatCount(m.records_processed)} records`,
      body: `This run read ${formatBytes(m.bytes_processed)} of ${run.dataset_id}. On their own, these records tell no story.`,
    },
    {
      id: "stream",
      kicker: "02 STREAMING",
      title: "Read in pieces, never all at once",
      figure: `${m.mb_per_second} MB/s`,
      body: `Measured on this run: ${run.chunks_total} chunks, ${m.duration_s} s, peak memory upper bound ${formatCount(m.peak_memory_mb)} MB.`,
    },
    {
      id: "normalise",
      kicker: "03 NORMALISATION",
      title: "One record format, with originals preserved",
      figure: `${formatCount(m.canonical_records)} canonical`,
      body: q?.timezone_conflict
        ? `${formatCount(m.rejected_records)} lines rejected into ${formatCount(m.quarantine_segments)} quarantine segment(s). A time zone conflict affects ${formatCount(q.timezone_conflict.affected_records)} records, and it is recorded rather than silently corrected.`
        : `${formatCount(m.rejected_records)} lines rejected into ${formatCount(m.quarantine_segments)} quarantine segment(s).`,
    },
    {
      id: "duplicates",
      kicker: "04 DUPLICATES",
      title: "Exact copies collapse. Repeated behaviour does not",
      figure: `${formatCount(m.exact_duplicates)} duplicates`,
      body: `${formatCount(m.behavioural_bursts)} repeated behaviours were grouped, each keeping its count and evidence.`,
    },
    {
      id: "patterns",
      kicker: "05 PATTERNS",
      title: "Rules surface candidates, not verdicts",
      figure: `${formatCount(m.detections)} candidates`,
      body: "An alert level, an IPS record or an application risk rating is never an incident by itself.",
    },
    {
      id: "chain",
      kicker: "06 KILL CHAIN",
      title: "Shared accounts and addresses connect the steps",
      figure: `${formatCount(m.incidents)} incidents`,
      body: top ? `Highest risk: ${top.summary.title}. ${top.root_cause}` : "No supported attack path was found in the data read.",
      showGraph: Boolean(top),
    },
    {
      id: "gaps",
      kicker: "07 UNCERTAINTY",
      title: "What the evidence does not show stays visible",
      figure: top ? `Margin ${top.uncertainty_margin}` : "—",
      body: gaps.length ? gaps.join(" ") : "There is no incident to assess.",
    },
    {
      id: "reach",
      kicker: "08 REACHABLE NEXT",
      title: "What could be reached next is a hypothesis",
      figure: `${formatCount(reach?.targets.length ?? 0)} hypothetical`,
      body: reach?.targets.length
        ? `${reach.targets.slice(0, 3).map((t) => t.target).join(", ")}. ${reach.limitations[0] ?? ""}`
        : "No reachable next system could be established from these logs.",
    },
    {
      id: "proof",
      kicker: "09 PROOF",
      title: "Every result is sealed and repeatable",
      figure: top ? `${formatCount(top.evidence.length)} citations` : "—",
      body: "Hashes of the source, the rules and the graph are sealed in a receipt. The same input gives the same graph.",
    },
    {
      id: "handoff",
      kicker: "10 INVESTIGATE",
      title: "Now open the real incident",
      figure: top?.summary.status === "unconfirmed" ? "Unconfirmed" : "—",
      body: top ? "Everything above came from this run. The workspace shows the evidence behind it." : "Open the run to see what was read.",
    },
  ];
}
