/**
 * Email templates are plain text with a tiny, safe markup so admins can edit them without HTML:
 *   {{variable}}                 – replaced (values are inserted as text)
 *   [[Button label|https://…]]   – rendered as a button
 *   [link text](https://…)       – rendered as a link
 *   blank line                   – new paragraph
 * All text is HTML-escaped; only URLs with http(s)/relative paths are linkified.
 */
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

export function fillVars(tpl: string, vars: Record<string, string | number | null | undefined>): string {
  return tpl.replace(/\{\{\s*([a-z0-9_]+)\s*\}\}/gi, (_, k: string) => {
    const v = vars[k];
    return v === undefined || v === null ? "" : String(v);
  });
}

const safeUrl = (u: string) => (/^(https?:\/\/|\/|mailto:)/i.test(u.trim()) ? u.trim() : "#");

export function renderEmailHtml(text: string, brand: { name: string; accent: string }): string {
  const paragraphs = text
    .trim()
    .split(/\n{2,}/)
    .map((block) => {
      const btn = block.match(/^\[\[(.+?)\|(.+?)\]\]$/);
      if (btn) {
        return `<p style="margin:24px 0"><a href="${esc(safeUrl(btn[2]))}" style="background:${brand.accent};color:#0b0b0c;text-decoration:none;font-weight:600;padding:12px 22px;border-radius:10px;display:inline-block">${esc(btn[1])}</a></p>`;
      }
      const html = esc(block)
        .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, t, u) => `<a href="${esc(safeUrl(u.replace(/&amp;/g, "&")))}" style="color:${brand.accent}">${t}</a>`)
        .replace(/\n/g, "<br>");
      return `<p style="margin:0 0 16px;line-height:1.6">${html}</p>`;
    })
    .join("");
  return `<!doctype html><html><body style="margin:0;background:#f4f3ef;font-family:Inter,-apple-system,Segoe UI,Roboto,sans-serif;color:#151517"><div style="max-width:560px;margin:0 auto;padding:32px 20px"><div style="font-weight:800;font-size:18px;margin-bottom:24px;letter-spacing:-.01em">${esc(brand.name)}</div><div style="background:#fff;border-radius:16px;padding:28px 28px 12px;border:1px solid #e6e4dc">${paragraphs}</div><div style="color:#8a8a8f;font-size:12px;margin-top:18px;line-height:1.5">You're receiving this because of activity on your ${esc(brand.name)} account. Manage notification preferences in your portal settings.</div></div></body></html>`;
}

/** Plain-text rendition (stored in the email log / used as the text alternative). */
export function renderEmailText(text: string): string {
  return text
    .replace(/\[\[(.+?)\|(.+?)\]\]/g, "$1: $2")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)")
    .trim();
}
