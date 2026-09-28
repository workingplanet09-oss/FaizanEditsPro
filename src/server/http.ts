/** RFC 6266 / 5987 Content-Disposition with a safe ASCII fallback, so file names with “—”, accents or emoji never break headers. */
export function contentDisposition(name: string, inline = false): string {
  const clean = name.replace(/[\r\n"\\]/g, "").trim() || "file";
  const ascii = clean.replace(/[^\x20-\x7e]/g, "_");
  return `${inline ? "inline" : "attachment"}; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(clean).replace(/['()*]/g, (c) => "%" + c.charCodeAt(0).toString(16).toUpperCase())}`;
}
