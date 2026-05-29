export type ParsedReference = {
  num: number;
  text: string;
};

export function parseReferences(markdown: string): ParsedReference[] {
  const section = markdown.match(/##\s*参考文献\s*\n([\s\S]*?)(?=\n##\s|\n---\s*$|$)/);
  if (!section) return [];
  const refs: ParsedReference[] = [];
  const re = /^(\d+)\.\s+(.+)$/gm;
  let m: RegExpExecArray | null;
  while ((m = re.exec(section[1])) !== null) {
    refs.push({ num: Number(m[1]), text: m[2].trim() });
  }
  return refs;
}

export function linkifyCitationsSimple(
  markdown: string,
  fileName: string,
  links: Record<string, Record<string, string>>,
): string {
  const fileLinks = links[fileName] ?? {};
  return markdown.replace(/\[(\d+(?:\s*,\s*\d+)*)\]/g, (_m, raw: string) => {
    const nums = raw.split(",").map((s) => s.trim()).filter(Boolean);
    const linked = nums.map((n) => {
      const key = fileLinks[n];
      if (key) return `[${n}](#zotero-${key})`;
      return `[${n}](#cite-${n})`;
    });
    return linked.join(", ");
  });
}

export function extractCitationNumbers(markdown: string): number[] {
  const out = new Set<number>();
  const re = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(markdown)) !== null) {
    const nums = m[1].split(",").map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
    nums.forEach((n) => out.add(n));
  }
  return [...out].sort((a, b) => a - b);
}

/**
 * Zotero 全文検索向けクエリ（著者のみだとヒット0件になりやすいためタイトル主体にする）
 */
export function searchQueryFromReference(text: string): string {
  const cleaned = text.replace(/\*[^*]+\*/g, " ").replace(/\s+/g, " ").trim();

  // "Author, et al. Title..." → Title 部分
  let titlePart = cleaned.replace(/^[^.]+\bet\s+al\.?\s*/i, "").trim();
  if (!titlePart || titlePart.length < 12) {
    const afterFirstDot = cleaned.split(/\.\s+/).slice(1).join(" ");
    titlePart = afterFirstDot || cleaned;
  }

  // 巻号・年の末尾を除去
  titlePart = titlePart.replace(/\s*\d{4}[;:,].*$/, "").trim();

  // 長すぎる場合は先頭の意味のある語句に圧縮
  if (titlePart.length > 180) {
    titlePart = titlePart.slice(0, 180);
  }

  return titlePart;
}

/** フォールバック用の短いキーワード検索 */
export function fallbackSearchQueryFromReference(text: string): string {
  const cleaned = text.replace(/\*[^*]+\*/g, " ").replace(/\s+/g, " ").trim();
  const author = cleaned.match(/^([A-Z][a-zA-Z-]+)/)?.[1] ?? "";
  const titlePart = searchQueryFromReference(text);
  const keywords = titlePart
    .split(/\W+/)
    .filter((w) => w.length > 4)
    .slice(0, 6)
    .join(" ");
  return [author, keywords].filter(Boolean).join(" ").trim();
}
