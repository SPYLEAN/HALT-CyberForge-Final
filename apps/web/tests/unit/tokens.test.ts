// AT-7.1: generated token files are current, and the palette meets 4.5:1 text / 3:1 marks in both themes.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { color } from "@/styles/tokens";

const web = resolve(__dirname, "../..");
const tokensJson = JSON.parse(
  readFileSync(resolve(web, "../../assets/halt-package/02-design-system/tokens.json"), "utf8"),
) as { color: { tokens: Array<{ name: string }> } };

function luminance(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const v = parseInt(hex.slice(i, i + 2), 16) / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a: string, b: string): number {
  const [x, y] = [luminance(a), luminance(b)];
  return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
}

const GROUNDS = ["bg", "surface", "surface-raised"] as const;
const TEXT = ["text", "text-secondary", "threat-text", "business-text"] as const;
const MARKS = ["threat-observed", "business", "border-strong", "neutral-evidence", "proof-ring"] as const;

describe("design tokens", () => {
  it("generated files match tokens.json (npm run gen:tokens)", () => {
    expect(() => execFileSync(process.execPath, [resolve(web, "scripts/build-tokens.mjs"), "--check"], { stdio: "pipe" })).not.toThrow();
  });

  it("exposes every colour token for both themes", () => {
    const names = tokensJson.color.tokens.map((t) => t.name).sort();
    expect(Object.keys(color.dark).sort()).toEqual(names);
    expect(Object.keys(color.light).sort()).toEqual(names);
  });

  for (const theme of ["dark", "light"] as const) {
    it(`${theme}: text tokens reach 4.5:1 and marks 3:1 on every ground`, () => {
      for (const ground of GROUNDS) {
        for (const fg of TEXT) expect(contrast(color[theme][fg], color[theme][ground]), `${fg} on ${ground}`).toBeGreaterThanOrEqual(4.5);
        for (const fg of MARKS) expect(contrast(color[theme][fg], color[theme][ground]), `${fg} on ${ground}`).toBeGreaterThanOrEqual(3);
      }
    });
  }

  it("Ember and Verdigris stay distinct roles: forecast threat aliases observed threat", () => {
    expect(color.dark["threat-forecast"]).toBe(color.dark["threat-observed"]);
    expect(color.dark.business).not.toBe(color.dark["threat-observed"]);
  });
});
