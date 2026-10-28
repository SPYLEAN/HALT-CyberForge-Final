// AT-7.2: no hex colour literal in components or pages (CSS included). Colours come from tokens only.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";

import { expect, it } from "vitest";

const web = resolve(__dirname, "../..");
const HEX = /#[0-9A-Fa-f]{3}(?:[0-9A-Fa-f]{1}|[0-9A-Fa-f]{3}|[0-9A-Fa-f]{5})?\b/;

function* files(dir: string): Generator<string> {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) yield* files(path);
    else if (/\.(tsx?|css)$/.test(name)) yield path;
  }
}

it("components and app contain no hex colours", () => {
  const offenders: string[] = [];
  for (const root of ["src/components", "src/app"]) {
    for (const path of files(resolve(web, root))) {
      readFileSync(path, "utf8")
        .split("\n")
        .forEach((line, i) => {
          // "#id" fragment links in hrefs are not colours; a colour needs a hex-only token after '#'.
          if (HEX.test(line) && !/href=\{?[`"']#/.test(line)) offenders.push(`${relative(web, path)}:${i + 1}: ${line.trim()}`);
        });
    }
  }
  expect(offenders).toEqual([]);
});
