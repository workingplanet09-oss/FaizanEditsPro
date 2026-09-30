/** Renders every named icon of the previous UI to SVG and stores the inner markup, so the PHP pages draw the very same icons. */
import { writeFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ICONS } from "../src/components/ui/icon";

const out: Record<string, string> = {};
for (const [name, C] of Object.entries(ICONS)) {
  const svg = renderToStaticMarkup(createElement(C as any, { size: 24, strokeWidth: 1.75 }));
  const m = svg.match(/^<svg[^>]*>([\s\S]*)<\/svg>$/);
  if (!m) throw new Error(`Unexpected markup for ${name}: ${svg.slice(0, 120)}`);
  out[name] = m[1];
}
writeFileSync("public_html/app/data/icons.json", JSON.stringify(out));
console.log(Object.keys(out).length, "icons;", JSON.stringify(out).length, "bytes");
console.log(renderToStaticMarkup(createElement((ICONS as any).check, { size: 18, strokeWidth: 1.75 })));
