export const SYNTHETIC_LAB_NOTICE = "Synthetic Response Lab — separate demonstration, not derived from the selected FireX run.";

/** Marks the authored response demonstration wherever it appears, so that it cannot be read as log analysis. */
export function SyntheticLabNotice() {
  return (
    <p className="v2-lab-notice" role="note" data-testid="synthetic-lab-notice">
      {SYNTHETIC_LAB_NOTICE}
    </p>
  );
}
