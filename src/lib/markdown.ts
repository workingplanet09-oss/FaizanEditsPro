import { marked } from "marked";
import sanitizeHtml from "sanitize-html";

/**
 * Markdown → sanitised HTML. Content is admin-authored, but we still sanitise on render so a compromised or
 * careless edit can never inject script into visitors' browsers.
 */
export function renderMarkdown(md: string | null | undefined): string {
  if (!md) return "";
  const raw = marked.parse(md, { async: false, gfm: true, breaks: false }) as string;
  return sanitizeHtml(raw, {
    allowedTags: ["p", "br", "strong", "em", "b", "i", "u", "s", "a", "ul", "ol", "li", "h2", "h3", "h4", "blockquote", "code", "pre", "hr", "img", "table", "thead", "tbody", "tr", "th", "td"],
    allowedAttributes: { a: ["href", "title", "target", "rel"], img: ["src", "alt", "title", "loading"], th: ["align"], td: ["align"] },
    allowedSchemes: ["http", "https", "mailto"],
    allowedSchemesByTag: { img: ["http", "https"] },
    transformTags: {
      a: (tag, attribs) => ({ tagName: "a", attribs: { ...attribs, rel: "noopener noreferrer", ...(attribs.href?.startsWith("http") ? { target: "_blank" } : {}) } }),
      img: (tag, attribs) => ({ tagName: "img", attribs: { ...attribs, loading: "lazy" } }),
    },
  });
}

/** Plain-text excerpt for meta descriptions / cards. */
export function excerpt(md: string | null | undefined, n = 160): string {
  const text = (md ?? "").replace(/[#*_`>\[\]()!-]/g, "").replace(/\s+/g, " ").trim();
  return text.length > n ? `${text.slice(0, n - 1).trimEnd()}…` : text;
}
