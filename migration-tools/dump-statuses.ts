/** Exports the status machine (labels, tones, transitions, pipeline) so the PHP version uses exactly the same values. */
import { writeFileSync } from "node:fs";
import * as s from "../src/lib/statuses";

const out: Record<string, unknown> = {};
for (const [k, v] of Object.entries(s)) if (typeof v !== "function") out[k] = v;
writeFileSync("public_html/app/data/statuses.json", JSON.stringify(out, null, 1));
console.log("statuses.json", Object.keys(out).join(", "));
