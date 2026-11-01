// Exports the deck: node presentation/build.mjs
// Writes HALT-Final-Submission.pdf, and a PNG of each slide into preview/ for checking.
import { copyFileSync, mkdirSync, statSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { chromium } from "@playwright/test";

const HERE = dirname(fileURLToPath(import.meta.url));
const preview = join(HERE, "preview");
mkdirSync(preview, { recursive: true });
copyFileSync(join(HERE, "../apps/web/public/brand/halt-horizontal-bone.svg"), join(HERE, "assets/halt-horizontal-bone.svg"));

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
await page.goto(pathToFileURL(join(HERE, "deck.html")).href, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);

// Nothing may spill out of a slide. An overflowing element fails the export rather than shipping clipped.
const spills = await page.evaluate(() =>
  [...document.querySelectorAll(".slide")].flatMap((slide) => {
    const box = slide.getBoundingClientRect();
    return [...slide.querySelectorAll(".content *, .text *, .axes *, .foot *")]
      .filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width && (r.right > box.right + 1 || r.bottom > box.bottom + 1 || r.left < box.left - 1);
      })
      .map((el) => `${slide.id}: <${el.tagName.toLowerCase()}> ${(el.textContent ?? "").trim().slice(0, 50)}`);
  }),
);
if (spills.length) console.log(`OVERFLOW\n${spills.join("\n")}`);

const slides = await page.locator(".slide").all();
for (const [i, slide] of slides.entries()) await slide.screenshot({ path: join(preview, `slide-${String(i + 1).padStart(2, "0")}.png`) });

const pdf = join(HERE, "HALT-Final-Submission.pdf");
await page.emulateMedia({ media: "print" });
await page.pdf({ path: pdf, printBackground: true, preferCSSPageSize: true });
await browser.close();
console.log(`${slides.length} slides, ${(statSync(pdf).size / 1e6).toFixed(1)} MB, ${spills.length} overflow(s)`);
