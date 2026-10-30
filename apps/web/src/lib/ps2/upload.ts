// Client-side checks before an upload. They mirror the API contract so mistakes show before anything is
// sent; the API remains the authority and its own errors are shown verbatim.
import type { AdapterInfo, IntakeCapabilities, RawFile } from "./api";

/** RawFile.filename pattern from the API contract (services/api/halt/ps2/schema.py). */
export const FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;

const FORMAT_BY_EXTENSION: Record<string, string> = { json: "json", jsonl: "jsonl", ndjson: "jsonl", csv: "csv" };

export interface Selected {
  file: File;
  format: string | null; // from the extension; null when unsupported
  adapter: string; // "" until chosen
}

export function formatOf(name: string): string | null {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  return FORMAT_BY_EXTENSION[ext] ?? null;
}

export function adaptersFor(format: string | null, caps: IntakeCapabilities): AdapterInfo[] {
  return caps.adapters.filter((a) => a.format === format);
}

/** Preselect only when the file is named after an adapter that reads its format (e.g. idp_signin.jsonl). */
export function suggestAdapter(name: string, caps: IntakeCapabilities): string {
  const stem = name.toLowerCase().replace(/\.[^.]+$/, "");
  const format = formatOf(name);
  return adaptersFor(format, caps).find((a) => a.adapter_id === stem)?.adapter_id ?? "";
}

export const acceptAttribute = (caps: IntakeCapabilities) =>
  [...new Set(caps.adapters.flatMap((a) => Object.entries(FORMAT_BY_EXTENSION).filter(([, f]) => f === a.format).map(([e]) => `.${e}`)))]
    .sort()
    .join(",");

export function megabytes(bytes: number): string {
  return `${(bytes / 1_000_000).toLocaleString("en-GB", { maximumFractionDigits: 1 })} MB`;
}

/** Problems with the current selection, each phrased as what to change. Empty means it may be uploaded. */
export function validate(selected: Selected[], caps: IntakeCapabilities): string[] {
  const { limits } = caps;
  const problems: string[] = [];
  if (!selected.length) problems.push("Choose at least one file.");
  if (selected.length > limits.max_files) problems.push(`At most ${limits.max_files} files per upload; ${selected.length} are selected.`);
  const names = selected.map((s) => s.file.name);
  if (new Set(names).size !== names.length) problems.push("File names must be unique within an upload.");
  let total = 0;
  for (const s of selected) {
    total += s.file.size;
    if (!FILENAME.test(s.file.name)) problems.push(`${s.file.name}: use letters, digits, ".", "_" or "-" only (no spaces or folders).`);
    if (!s.format) problems.push(`${s.file.name}: only ${acceptAttribute(caps)} files are accepted.`);
    else if (!s.adapter) problems.push(`${s.file.name}: choose the log source it came from.`);
    if (s.file.size > limits.max_file_bytes) problems.push(`${s.file.name}: larger than the ${megabytes(limits.max_file_bytes)} per-file limit.`);
  }
  if (total > limits.max_total_bytes) problems.push(`Together the files exceed the ${megabytes(limits.max_total_bytes)} upload limit.`);
  return problems;
}

/** Read each file as text and attach the content type the chosen adapter's format expects. */
export async function toRawFiles(selected: Selected[], caps: IntakeCapabilities): Promise<RawFile[]> {
  return Promise.all(
    selected.map(async (s) => {
      const adapter = caps.adapters.find((a) => a.adapter_id === s.adapter);
      if (!adapter) throw new Error(`${s.file.name}: no adapter chosen`);
      return {
        filename: s.file.name,
        adapter: adapter.adapter_id,
        content_type: adapter.content_types[0] as RawFile["content_type"],
        content: await s.file.text(),
      };
    }),
  );
}
