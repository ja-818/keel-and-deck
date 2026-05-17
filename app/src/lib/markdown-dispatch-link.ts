export type DispatchActionKind = "create" | "adjust" | "save";

export function extractMarkdownDispatchLinks<TPayload>(
  content: string,
  marker: string,
  action: DispatchActionKind,
  parseHref: (href: string) => TPayload | null,
  isValidPayload: (payload: TPayload) => boolean,
): {
  content: string;
  payloads: TPayload[];
  pendingAction: DispatchActionKind | null;
} {
  const payloads: TPayload[] = [];
  let output = "";
  let cursor = 0;
  let pendingAction: DispatchActionKind | null = null;

  while (cursor < content.length) {
    const start = content.indexOf(marker, cursor);
    if (start === -1) {
      output += content.slice(cursor);
      break;
    }

    output += content.slice(cursor, start);
    const hrefStart = start + marker.length;
    const match = findDispatchLinkEnd(content, hrefStart, parseHref, isValidPayload);
    if (!match) {
      const paragraphEnd = content.indexOf("\n\n", hrefStart);
      if (paragraphEnd === -1) {
        pendingAction = action;
        break;
      }
      cursor = paragraphEnd + 2;
      continue;
    }

    payloads.push(match.payload);
    cursor = match.end + 1;
  }

  return { content: output, payloads, pendingAction };
}

function findDispatchLinkEnd<TPayload>(
  content: string,
  hrefStart: number,
  parseHref: (href: string) => TPayload | null,
  isValidPayload: (payload: TPayload) => boolean,
): { end: number; payload: TPayload } | null {
  let best: { end: number; payload: TPayload } | null = null;
  for (let index = hrefStart; index < content.length; index += 1) {
    if (content[index] !== ")") continue;
    const href = content.slice(hrefStart, index);
    const payload = parseHref(href);
    if (payload && isValidPayload(payload)) {
      best = { end: index, payload };
    }
    const next = content[index + 1];
    if (best && (next === undefined || /\s/.test(next))) return best;
  }
  return best;
}
