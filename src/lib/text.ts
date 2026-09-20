// Pure text-wrapping helpers. No DOM dependency: the caller passes a
// measure function (usually canvas 2d context.measureText). Kept pure so
// the logic can be unit-tested in Node.

export type MeasureFn = (text: string) => number;

/**
 * Greedy word-wrap of a single paragraph (no newlines) to the given width.
 * Overlong single words (URLs, hashtags) are hard-broken so nothing
 * overflows. Whitespace sequences collapse to a single space.
 */
export function wrapParagraph(
  paragraph: string,
  maxWidth: number,
  measure: MeasureFn
): string[] {
  const lines: string[] = [];
  const words = paragraph.split(/\s+/).filter((w) => w.length > 0);
  if (words.length === 0) return [""];

  let current = "";
  const pushLine = (line: string) => {
    lines.push(line);
  };

  for (const word of words) {
    const candidate = current ? current + " " + word : word;
    if (measure(candidate) <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) pushLine(current);

    if (measure(word) > maxWidth) {
      // Hard-break the overlong word on code-point boundaries so
      // emojis and other astral characters are never split.
      let part = "";
      for (const ch of Array.from(word)) {
        const next = part + ch;
        if (measure(next) <= maxWidth || part === "") {
          part = next;
        } else {
          pushLine(part);
          part = ch;
        }
      }
      current = part;
    } else {
      current = word;
    }
  }
  pushLine(current);
  return lines;
}

/**
 * Wrap full post text, preserving line breaks and paragraphs.
 * A blank entry ("") marks a paragraph gap and is rendered as vertical
 * spacing, never dropped. A single line break is a SOFT break: it starts a
 * new wrapped line with no extra gap, exactly like pickax.com renders <br>
 * inside a paragraph. Only genuinely empty lines become paragraph gaps.
 */
export function wrapText(
  text: string,
  maxWidth: number,
  measure: MeasureFn
): string[] {
  const out: string[] = [];
  const paragraphs = text.replace(/\r\n/g, "\n").split("\n");
  for (const p of paragraphs) {
    if (p.trim() === "") {
      // Empty line = paragraph gap. Collapse runs of empty lines into one
      // (cleanText already caps them, but stay safe on raw input).
      if (out.length > 0 && out[out.length - 1] !== "") out.push("");
      continue;
    }
    out.push(...wrapParagraph(p, maxWidth, measure));
  }
  // Never lead or trail with a gap.
  while (out.length > 0 && out[0] === "") out.shift();
  while (out.length > 0 && out[out.length - 1] === "") out.pop();
  return out;
}
