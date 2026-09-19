/**
 * Patch mammoth/rendered HTML when a Negotiate Accept lands.
 *
 * The saved document is plain text and is spliced separately. This helper only
 * updates the in-memory HTML so the viewer stays in sync.
 *
 * Coordinate rules:
 *   - Block tags (p/h1–h6/li/…) count as one collapsed space so a heading +
 *     following <p> still matches across `</h3><p>`.
 *   - Inline tags (strong/em/span/…) do not insert a space, so Mammoth wraps
 *     like `Article 28</strong>(3)(g)` still match plain `Article 28(3)(g)`.
 *
 * Structural splice:
 *   When the matched span crosses block boundaries (e.g. <h2>heading</h2><p>body),
 *   a naive slice would delete the parent closer (`</h2>`) and the following
 *   sibling <p>s parse as children of the still-open heading. Re-emit closers
 *   for block tags that were open at htmlStart and closed inside the range.
 */

const BLOCK_TAGS = new Set([
  "p", "div", "h1", "h2", "h3", "h4", "h5", "h6",
  "li", "ul", "ol", "tr", "td", "th", "table", "thead", "tbody", "tfoot",
  "blockquote", "pre", "hr", "br", "section", "article", "header", "footer",
  "nav", "figure", "figcaption", "dl", "dt", "dd",
]);

const VOID_TAGS = new Set([
  "br", "hr", "img", "input", "meta", "link", "col", "wbr",
  "area", "base", "embed", "source", "track",
]);

function tagName(rawTag: string): string | null {
  const m = rawTag.match(/^<\s*\/?\s*([a-zA-Z][a-zA-Z0-9]*)/);
  return m ? m[1].toLowerCase() : null;
}

function tagEmitsCollapsedSpace(rawTag: string): boolean {
  const name = tagName(rawTag);
  return name != null && BLOCK_TAGS.has(name);
}

function decodeHtmlEntity(entity: string): string {
  const named: Record<string, string> = {
    "&amp;": "&",
    "&lt;": "<",
    "&gt;": ">",
    "&quot;": '"',
    "&#39;": "'",
    "&apos;": "'",
    "&nbsp;": " ",
  };
  const lower = entity.toLowerCase();
  if (named[lower]) return named[lower];
  const dec = entity.match(/^&#(\d+);$/);
  if (dec) return String.fromCharCode(Number(dec[1]));
  const hex = entity.match(/^&#x([0-9a-f]+);$/i);
  if (hex) return String.fromCharCode(parseInt(hex[1], 16));
  return entity;
}

function normaliseChar(ch: string): string {
  return ch
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00AD/g, "")
    .replace(/\u200B/g, "")
    .replace(/[\u202F\u2009\u00A0]/g, " ");
}

function isWs(ch: string): boolean {
  return /[\s\r\n\t\u00A0]/.test(ch);
}

function isCloseTag(rawTag: string): boolean {
  return /^<\s*\//.test(rawTag);
}

function isSelfClosingTag(rawTag: string, name: string): boolean {
  return VOID_TAGS.has(name) || /\/\s*>$/.test(rawTag);
}

function forEachTag(
  html: string,
  from: number,
  to: number,
  visit: (raw: string, name: string, isClose: boolean, isSelf: boolean) => void,
): void {
  let i = from;
  const limit = Math.min(to, html.length);
  while (i < limit) {
    if (html[i] !== "<") {
      i++;
      continue;
    }
    if (html.startsWith("<!--", i)) {
      const endC = html.indexOf("-->", i + 4);
      i = endC === -1 ? limit : endC + 3;
      continue;
    }
    const gt = html.indexOf(">", i);
    if (gt === -1) break;
    const raw = html.slice(i, gt + 1);
    const name = tagName(raw);
    i = gt + 1;
    if (!name) continue;
    visit(raw, name, isCloseTag(raw), isSelfClosingTag(raw, name));
  }
}

function rangeCrossesBlockBoundary(html: string, start: number, end: number): boolean {
  let crossed = false;
  forEachTag(html, start, end, (_raw, name, _isClose, isSelf) => {
    if (!isSelf && BLOCK_TAGS.has(name)) crossed = true;
  });
  return crossed;
}

/**
 * Closers for block elements that were already open at `start` and whose
 * matching close tag sits inside [start, end). Emitted after the replacement
 * so a heading+first-<p> splice cannot leave `<h2>` open over later siblings.
 */
function closersForOpenBlocksClosedInRange(html: string, start: number, end: number): string {
  type Frame = { name: string; fromBefore: boolean };
  const stack: Frame[] = [];

  forEachTag(html, 0, start, (_raw, name, isClose, isSelf) => {
    if (isSelf) return;
    if (isClose) {
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k].name === name) {
          stack.splice(k, 1);
          break;
        }
      }
    } else {
      stack.push({ name, fromBefore: true });
    }
  });

  const closers: string[] = [];
  forEachTag(html, start, end, (_raw, name, isClose, isSelf) => {
    if (isSelf) return;
    if (isClose) {
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k].name === name) {
          if (stack[k].fromBefore && BLOCK_TAGS.has(name)) {
            closers.push(`</${name}>`);
          }
          stack.splice(k, 1);
          break;
        }
      }
    } else {
      stack.push({ name, fromBefore: false });
    }
  });

  return closers.join("");
}

/**
 * Replace `original` with `replacement` inside mammoth HTML.
 * Returns the input unchanged when the original cannot be located.
 */
export function patchRichHtmlOnAccept(
  richHtml: string,
  original: string,
  replacement: string,
): string {
  const orig = original.trim();
  if (!richHtml || orig.length < 10) return richHtml;

  if (richHtml.includes(orig)) {
    return richHtml.replace(orig, replacement);
  }

  const normOrig = orig
    .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"')
    .replace(/[\u2013\u2014\u2015]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
  if (normOrig.length < 10) return richHtml;

  const collapsed: string[] = [];
  const posMap: number[] = [];
  let i = 0;
  let prevSpace = false;

  const emit = (raw: string, htmlIdx: number) => {
    const expanded = normaliseChar(raw);
    for (const ch of expanded) {
      if (isWs(ch)) {
        if (!prevSpace) {
          collapsed.push(" ");
          posMap.push(htmlIdx);
          prevSpace = true;
        }
      } else {
        collapsed.push(ch.toLowerCase());
        posMap.push(htmlIdx);
        prevSpace = false;
      }
    }
  };

  while (i < richHtml.length) {
    if (richHtml[i] === "<") {
      const end = richHtml.indexOf(">", i);
      if (end === -1) break;
      const rawTag = richHtml.slice(i, end + 1);
      if (tagEmitsCollapsedSpace(rawTag) && !prevSpace) {
        collapsed.push(" ");
        posMap.push(i);
        prevSpace = true;
      }
      i = end + 1;
      continue;
    }
    if (richHtml[i] === "&") {
      const semi = richHtml.indexOf(";", i);
      if (semi !== -1 && semi - i <= 8) {
        emit(decodeHtmlEntity(richHtml.slice(i, semi + 1)), i);
        i = semi + 1;
        continue;
      }
    }
    emit(richHtml[i], i);
    i++;
  }

  const collapsedStr = collapsed.join("");
  const matchIdx = collapsedStr.indexOf(normOrig);
  if (matchIdx === -1) return richHtml;

  const htmlStart = posMap[matchIdx];
  const endCollapsed = matchIdx + normOrig.length - 1;
  if (htmlStart == null || endCollapsed >= posMap.length) return richHtml;

  const lastCharStart = posMap[endCollapsed];
  let htmlEnd = lastCharStart + 1;
  if (richHtml[lastCharStart] === "&") {
    const semi = richHtml.indexOf(";", lastCharStart);
    if (semi !== -1 && semi - lastCharStart <= 8) htmlEnd = semi + 1;
  }

  if (htmlEnd <= htmlStart) return richHtml;

  // Same posMap coordinates as before. When the span crosses a block boundary,
  // keep parent closers (</h2>, </h3>, …) so later sibling <p>/<h2> stay siblings.
  const closers = rangeCrossesBlockBoundary(richHtml, htmlStart, htmlEnd)
    ? closersForOpenBlocksClosedInRange(richHtml, htmlStart, htmlEnd)
    : "";
  return richHtml.slice(0, htmlStart) + replacement + closers + richHtml.slice(htmlEnd);
}
