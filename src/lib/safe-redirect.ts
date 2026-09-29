/**
 * Post-login redirects must stay on this site. Only a rooted path is accepted: no protocol-relative `//host`, no backslashes
 * (browsers treat `/\host` like `//host`), and no whitespace or control characters (browsers silently strip tabs and newlines
 * before parsing, so `/<TAB>/host` would become `//host`).
 */
export function safeRedirectPath(next: string | undefined | null, fallback: string): string {
  if (!next || next.length > 500) return fallback;
  return /^\/(?![/\\])[^\s\\\u0000-\u001f\u007f]*$/.test(next) ? next : fallback;
}
