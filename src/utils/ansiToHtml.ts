import Convert from "ansi-to-html";

const converter = new Convert({
  fg: "var(--foreground)",
  bg: "transparent",
  escapeXML: true,
  newline: false,
});

/**
 * Regex pattern for detecting ANSI SGR (Select Graphic Rendition) sequences.
 * Matches sequences like `\x1b[31m` (color), `\x1b[1m` (bold), etc.
 * 
 * Note: This pattern only matches SGR sequences ending with 'm' (color/style codes).
 * It does not match other ANSI escape sequences like cursor movement, screen clearing,
 * or other CSI (Control Sequence Introducer) sequences. This is sufficient for
 * Claude Code's terminal output, which primarily uses SGR codes for styling.
 */
// eslint-disable-next-line no-control-regex
const ANSI_REGEX = /\x1b\[[\d;]*m/;

/**
 * Returns true if the string contains ANSI SGR escape sequences.
 */
export function hasAnsiCodes(text: string): boolean {
  return ANSI_REGEX.test(text);
}

/**
 * Strip ANSI SGR escape codes from a string, returning plain text.
 * Uses global flag for replacement to remove all occurrences.
 */
export function stripAnsiCodes(text: string): string {
  return text.replace(new RegExp(ANSI_REGEX.source, "g"), "");
}

/**
 * Regex that matches either an HTML tag or a URL in text content.
 *
 * Group 1: HTML tag (skipped — returned as-is)
 * Group 2: URL with http(s) or mailto scheme (linkified)
 *
 * The alternation ensures URLs inside HTML attributes are never matched
 * because the tag branch `<[^>]*>` consumes the entire tag first.
 *
 * Trailing punctuation (.,;:!?) and closing brackets are excluded from
 * the URL to avoid capturing sentence-ending characters. Closing parens
 * `)` are allowed by the regex and handled by balanced-paren trimming
 * in linkifyUrls() so that Wikipedia-style URLs are preserved while
 * parenthetical text like "(see https://example.com)" works correctly.
 */
const URL_OR_TAG_REGEX =
  /(<[^>]*>)|((?:https?:\/\/|mailto:)[^\s<>"'`]+[^\s<>"'`.,;:!?}\]])/gi;

/**
 * Trim unbalanced trailing closing parentheses from a matched URL.
 *
 * Preserves balanced parens in URLs (e.g. Wikipedia links) while
 * stripping excess trailing `)` from surrounding prose.
 *
 * Examples:
 *   "https://example.com)"           → "https://example.com"   (trimmed)
 *   "https://wiki/Rust_(lang)"       → "https://wiki/Rust_(lang)"  (kept)
 *   "https://wiki/Rust_(lang))"      → "https://wiki/Rust_(lang)"  (1 trimmed)
 */
function trimUnbalancedParens(url: string): string {
  let opens = 0;
  let closes = 0;
  for (const ch of url) {
    if (ch === "(") opens++;
    else if (ch === ")") closes++;
  }
  if (closes <= opens) return url;

  let excess = closes - opens;
  let end = url.length;
  while (excess > 0 && end > 0 && url[end - 1] === ")") {
    end--;
    excess--;
  }
  return url.slice(0, end);
}

/**
 * Wrap URLs in HTML string with `<a>` tags, skipping URLs inside HTML tags.
 *
 * Only http://, https://, and mailto: schemes are linkified.
 * The input is expected to be HTML-escaped already (via escapeXML: true),
 * so injecting `<a>` tags here is safe — user content cannot produce
 * unescaped HTML.
 */
export function linkifyUrls(html: string): string {
  return html.replace(URL_OR_TAG_REGEX, (match, tag: string | undefined, url: string | undefined) => {
    // HTML tag — return unchanged
    if (tag) return tag;
    // URL — trim unbalanced parens, sanitize href, wrap in <a>
    if (url) {
      const trimmed = trimUnbalancedParens(url);
      const trailing = url.slice(trimmed.length);
      const safeHref = trimmed.replace(/"/g, "&quot;");
      return `<a href="${safeHref}" class="ansi-url">${trimmed}</a>${trailing}`;
    }
    return match;
  });
}

/**
 * Convert ANSI escape codes to HTML spans with inline styles,
 * then linkify URLs in the text content.
 *
 * Always returns HTML-safe output (non-ANSI text is HTML-escaped).
 * URLs are wrapped in `<a>` tags that the global useExternalLinks()
 * hook intercepts to open in the system browser.
 */
export function ansiToHtml(text: string): string {
  const html = converter.toHtml(text);
  return linkifyUrls(html);
}
