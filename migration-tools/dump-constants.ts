/** Exports the data-only constants of the previous version to JSON so the PHP version uses exactly the same values. */
import { writeFileSync } from "node:fs";
import * as site from "../src/lib/site-defaults";
import * as cms from "../src/lib/cms-resources";
import { PERMISSIONS } from "../src/lib/permissions";

const findFns = (v: unknown, path = ""): string[] => {
  if (typeof v === "function") return [path];
  if (v && typeof v === "object") return Object.entries(v).flatMap(([k, x]) => findFns(x, `${path}.${k}`));
  return [];
};
const out = "public_html/app/data/";
const dump = (name: string, obj: Record<string, unknown>) => {
  const fns = findFns(obj);
  if (fns.length) throw new Error(`${name} contains functions: ${fns.slice(0, 5).join(", ")}`);
  writeFileSync(out + name, JSON.stringify(obj, null, 1));
  console.log(name, JSON.stringify(obj).length, "bytes");
};
dump("site-defaults.json", { SETTING_DEFAULTS: site.SETTING_DEFAULTS, CONTRACT_TEMPLATE: site.CONTRACT_TEMPLATE, DEFAULT_PROJECT_FOLDERS: site.DEFAULT_PROJECT_FOLDERS, LEAD_SOURCES: site.LEAD_SOURCES, BUDGET_RANGES: site.BUDGET_RANGES, SERVICE_TO_LOOKING_FOR: site.SERVICE_TO_LOOKING_FOR });
// publicPath is a tiny function of the row's slug in every case; export it as a "{slug}" template for the PHP side
const resources = JSON.parse(JSON.stringify(cms.RESOURCES));
for (const [k, r] of Object.entries(cms.RESOURCES)) if (r.publicPath) resources[k].publicPathTemplate = r.publicPath({ slug: "{slug}" });
dump("cms-resources.json", { RESOURCES: resources, FAQ_CATEGORIES: cms.FAQ_CATEGORIES, SERVICE_ICONS: cms.SERVICE_ICONS, EMAIL_VARIABLES: cms.EMAIL_VARIABLES });
dump("permissions.json", { PERMISSIONS });
