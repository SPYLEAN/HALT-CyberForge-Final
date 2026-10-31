// Presentation wording for stored incidents. A sealed title stays exactly as stored; an unconfirmed incident is presented
// as a hypothesis. This only changes how a title reads, and decides nothing.
const SAFE_TITLES: Record<string, string> = {
  "Account created, used, then removed": "Possible short-lived administrator-account activity",
  "Security logging disabled around configuration changes": "Possible security-logging interference around configuration changes",
  "Concentrated multi-technique web attack on one target": "Possible concentrated web attack on one target",
};

/** Hypothesis-safe wording for any stored incident title. Rules without their own wording get "Possible". */
export function presentTitle(stored: string): string {
  const known = SAFE_TITLES[stored];
  if (known) return known;
  if (/^(possible|suspected|likely)\b/i.test(stored)) return stored;
  const lowered = /^[A-Z][a-z]/.test(stored) ? stored[0]!.toLowerCase() + stored.slice(1) : stored;
  return `Possible ${lowered}`;
}
