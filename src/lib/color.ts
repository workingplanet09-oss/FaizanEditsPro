/** Picks readable text (near-black or white) for a given background hex, using WCAG relative luminance. */
export function contrastOn(hex: string): string {
  const m = hex.replace("#", "").match(/^([0-9a-f]{6})$/i);
  if (!m) return "#0b0b0c";
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(m[1].slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
  const L = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  // contrast against black vs white
  return (L + 0.05) / 0.05 > 1.05 / (L + 0.05) ? "#0b0b0c" : "#ffffff";
}
