const parse = (hex: string): [number, number, number] | null => {
  const m = hex.replace("#", "").match(/^([0-9a-f]{6})$/i);
  return m ? ([0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16)) as [number, number, number]) : null;
};

const luminance = ([r, g, b]: [number, number, number]) => {
  const [lr, lg, lb] = [r, g, b].map((c) => c / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
};

const toHex = (rgb: [number, number, number]) => "#" + rgb.map((c) => Math.round(Math.max(0, Math.min(255, c))).toString(16).padStart(2, "0")).join("");

export const contrastRatio = (a: string, b: string): number => {
  const pa = parse(a);
  const pb = parse(b);
  if (!pa || !pb) return 1;
  const [hi, lo] = [luminance(pa), luminance(pb)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

/** Picks readable text (near-black or white) for a given background hex, using WCAG relative luminance. */
export function contrastOn(hex: string): string {
  const rgb = parse(hex);
  if (!rgb) return "#0b0b0c";
  const L = luminance(rgb);
  // contrast against black vs white
  return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? "#0b0b0c" : "#ffffff";
}

/**
 * The brand accent, nudged (toward black on light surfaces, toward white on dark ones) just far enough that
 * accent-coloured TEXT reaches `min` contrast against `surface`. Fills, borders and icons keep the pure accent.
 */
export function accentForText(accent: string, surface: string, toward: "black" | "white", min = 4.6): string {
  const rgb = parse(accent);
  if (!rgb) return accent;
  const target = toward === "black" ? 0 : 255;
  for (let t = 0; t <= 1.0001; t += 0.03) {
    const mixed = toHex(rgb.map((c) => c + (target - c) * t) as [number, number, number]);
    if (contrastRatio(mixed, surface) >= min) return mixed;
  }
  return toward === "black" ? "#000000" : "#ffffff";
}
