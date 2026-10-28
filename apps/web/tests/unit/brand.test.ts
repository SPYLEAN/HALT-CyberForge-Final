// AT-7.4: brand files and 3D exports in the app are byte-identical to the supplied package.
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { describe, expect, it } from "vitest";

import { COPIES, ICONS } from "../../scripts/copy-brand.mjs";

const web = resolve(__dirname, "../..");
const pkg = resolve(web, "../../assets/halt-package");
const sha = (path: string) => createHash("sha256").update(readFileSync(path)).digest("hex");

describe("brand assets", () => {
  for (const { from, to, skip } of COPIES) {
    it(`${to} mirrors ${from}`, () => {
      const expected = readdirSync(resolve(pkg, from)).filter((n) => !skip.includes(n)).sort();
      expect(readdirSync(resolve(web, to)).sort()).toEqual(expected);
      for (const name of expected) expect(sha(resolve(web, to, name)), name).toBe(sha(resolve(pkg, from, name)));
    });
  }

  it("app icons and mark geometry are the supplied files", () => {
    for (const { from, to } of ICONS) {
      expect(sha(resolve(web, to)), to).toBe(sha(resolve(pkg, from)));
    }
  });
});
