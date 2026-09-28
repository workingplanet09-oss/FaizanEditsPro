export function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

/**
 * Interview_Final.mp4 / Interview_Final_V2.mp4 / Interview final v3.mov → same version group.
 * Returns the normalised group key and the version number implied by the name (1 if none).
 */
export function parseVersionedName(filename: string): { group: string; version: number } {
  const dot = filename.lastIndexOf(".");
  const stem = dot > 0 ? filename.slice(0, dot) : filename;
  const m = stem.match(/^(.*?)[\s._-]*(?:v|ver|version)[\s._-]?(\d{1,3})$/i);
  const base = (m ? m[1] : stem).toLowerCase().replace(/[^a-z0-9]+/g, "");
  return { group: base || "file", version: m ? Number(m[2]) : 1 };
}
