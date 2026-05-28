import cors from "cors";
import dotenv from "dotenv";
import express from "express";
import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "../.env.local") });
dotenv.config({ path: path.join(__dirname, "../.env") });

const PORT = Number(process.env.PORT) || 3847;
const ZOTERO_USER_ID = process.env.ZOTERO_USER_ID ?? "";
const ZOTERO_API_KEY = process.env.ZOTERO_API_KEY ?? "";
const ROOT = path.join(__dirname, "..");
const GA_DIR = path.resolve(ROOT, process.env.GA_CONSENSUS_DIR ?? "../01_drafts/ga_consensus");
const LINKS_FILE = path.join(GA_DIR, ".zotero-citation-map.json");
const CANDIDATES_FILE = path.join(GA_DIR, ".zotero-unresolved-candidates.json");

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

function zoteroHeaders(): HeadersInit {
  return {
    "Zotero-API-Key": ZOTERO_API_KEY,
    "Zotero-API-Version": "3",
  };
}

async function zoteroFetch(url: string, init?: RequestInit) {
  if (!ZOTERO_USER_ID || !ZOTERO_API_KEY) {
    throw new Error("ZOTERO_USER_ID and ZOTERO_API_KEY must be set in .env.local");
  }
  const res = await fetch(url, { ...init, headers: { ...zoteroHeaders(), ...init?.headers } });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Zotero API ${res.status}: ${text.slice(0, 300)}`);
  }
  return res;
}

function assertGaFile(name: string) {
  if (!/^ga_[\w-]+\.md$/.test(name) && name !== "ga_consensus_draft.md") {
    throw new Error("Invalid filename");
  }
  const resolved = path.resolve(GA_DIR, name);
  if (!resolved.startsWith(GA_DIR + path.sep)) {
    throw new Error("Path escape");
  }
  return resolved;
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    gaDir: GA_DIR,
    zoteroConfigured: Boolean(ZOTERO_USER_ID && ZOTERO_API_KEY),
  });
});

app.get("/api/files", async (_req, res) => {
  try {
    const entries = await fs.readdir(GA_DIR);
    const files = entries
      .filter((f) => f.startsWith("ga_") && f.endsWith(".md"))
      .sort((a, b) => a.localeCompare(b, "ja"));
    res.json({ files });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get("/api/files/:name", async (req, res) => {
  try {
    const filePath = assertGaFile(req.params.name);
    const content = await fs.readFile(filePath, "utf-8");
    res.json({ name: req.params.name, content });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

app.put("/api/files/:name", async (req, res) => {
  try {
    const filePath = assertGaFile(req.params.name);
    const { content } = req.body as { content?: string };
    if (typeof content !== "string") {
      res.status(400).json({ error: "content required" });
      return;
    }
    await fs.writeFile(filePath, content, "utf-8");
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: String(e) });
  }
});

app.post("/api/files/:name/references/:num/sync-from-zotero", async (req, res) => {
  try {
    const filePath = assertGaFile(req.params.name);
    const refNum = Number(req.params.num);
    if (!Number.isFinite(refNum) || refNum <= 0) {
      res.status(400).json({ error: "Invalid reference number" });
      return;
    }
    const { key } = req.body as { key?: string };
    if (!key) {
      res.status(400).json({ error: "key required" });
      return;
    }

    const itemUrl = `https://api.zotero.org/users/${ZOTERO_USER_ID}/items/${key}?format=json`;
    const item = (await (await zoteroFetch(itemUrl)).json()) as ZoteroItem;
    const citation = formatVancouver(item);

    const content = await fs.readFile(filePath, "utf-8");
    const rewritten = rewriteReferenceLine(content, refNum, `${refNum}. ${citation}`);
    if (!rewritten.changed) {
      res.status(404).json({ error: "Reference number not found in file" });
      return;
    }
    await fs.writeFile(filePath, rewritten.content, "utf-8");
    res.json({ ok: true, citation });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get("/api/citation-links", async (_req, res) => {
  try {
    const raw = await fs.readFile(LINKS_FILE, "utf-8").catch(() => "{}");
    res.json(JSON.parse(raw));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.put("/api/citation-links", async (req, res) => {
  try {
    await fs.writeFile(LINKS_FILE, JSON.stringify(req.body, null, 2), "utf-8");
    res.json({ ok: true });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post("/api/citation-links/auto-link-all", async (_req, res) => {
  try {
    const entries = await fs.readdir(GA_DIR);
    const files = entries
      .filter((f) => f.startsWith("ga_") && f.endsWith(".md"))
      .sort((a, b) => a.localeCompare(b, "ja"));

    const raw = await fs.readFile(LINKS_FILE, "utf-8").catch(() => "{}");
    const linkMap = JSON.parse(raw) as Record<string, Record<string, string>>;

    let added = 0;
    let skipped = 0;
    let unresolved = 0;

    for (const fileName of files) {
      const filePath = path.join(GA_DIR, fileName);
      const content = await fs.readFile(filePath, "utf-8");
      const refs = extractReferences(content);
      const currentLinks = linkMap[fileName] ?? {};

      for (const ref of refs) {
        const refNum = String(ref.num);
        if (currentLinks[refNum]) {
          skipped += 1;
          continue;
        }

        const primaryQuery = buildSearchQuery(ref.text);
        let key = await searchFirstZoteroKey(primaryQuery);

        if (!key) {
          const fallbackQuery = buildFallbackSearchQuery(ref.text);
          if (fallbackQuery && fallbackQuery !== primaryQuery) {
            key = await searchFirstZoteroKey(fallbackQuery);
          }
        }

        if (key) {
          currentLinks[refNum] = key;
          added += 1;
        } else {
          unresolved += 1;
        }
      }

      linkMap[fileName] = currentLinks;
    }

    await fs.writeFile(LINKS_FILE, JSON.stringify(linkMap, null, 2), "utf-8");
    res.json({
      ok: true,
      files: files.length,
      added,
      skipped,
      unresolved,
      links: linkMap,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get("/api/citation-links/unresolved-candidates", async (_req, res) => {
  try {
    const raw = await fs.readFile(CANDIDATES_FILE, "utf-8").catch(() => "{}");
    res.json(JSON.parse(raw));
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post("/api/citation-links/unresolved-candidates/generate", async (_req, res) => {
  try {
    const entries = await fs.readdir(GA_DIR);
    const files = entries
      .filter((f) => f.startsWith("ga_") && f.endsWith(".md"))
      .sort((a, b) => a.localeCompare(b, "ja"));

    const rawLinks = await fs.readFile(LINKS_FILE, "utf-8").catch(() => "{}");
    const linkMap = JSON.parse(rawLinks) as Record<string, Record<string, string>>;
    const cacheRaw = await fs.readFile(CANDIDATES_FILE, "utf-8").catch(() => "{}");
    const cache = JSON.parse(cacheRaw) as UnresolvedCandidateMap;

    let unresolvedCount = 0;
    let withCandidates = 0;

    for (const fileName of files) {
      const content = await fs.readFile(path.join(GA_DIR, fileName), "utf-8");
      const refs = extractReferences(content);
      const currentLinks = linkMap[fileName] ?? {};
      const fileCache: Record<string, UnresolvedCandidateEntry> = {};

      for (const ref of refs) {
        const refNum = String(ref.num);
        if (currentLinks[refNum]) continue;
        unresolvedCount += 1;

        const cached = cache[fileName]?.[refNum];
        if (cached && cached.candidates?.length > 0) {
          fileCache[refNum] = cached;
          withCandidates += 1;
          continue;
        }

        const generated = await searchCandidatesRelaxed(ref.text);
        if (generated.candidates.length > 0) withCandidates += 1;
        fileCache[refNum] = generated;
      }

      if (Object.keys(fileCache).length > 0) {
        cache[fileName] = fileCache;
      } else {
        delete cache[fileName];
      }
    }

    await fs.writeFile(CANDIDATES_FILE, JSON.stringify(cache, null, 2), "utf-8");
    res.json({
      ok: true,
      unresolvedCount,
      withCandidates,
      candidates: cache,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.post("/api/citation-links/unresolved-candidates/generate-for-file", async (req, res) => {
  try {
    const { fileName } = req.body as { fileName?: string };
    if (!fileName) {
      res.status(400).json({ error: "fileName required" });
      return;
    }
    const filePath = assertGaFile(fileName);
    const rawLinks = await fs.readFile(LINKS_FILE, "utf-8").catch(() => "{}");
    const linkMap = JSON.parse(rawLinks) as Record<string, Record<string, string>>;
    const cacheRaw = await fs.readFile(CANDIDATES_FILE, "utf-8").catch(() => "{}");
    const cache = JSON.parse(cacheRaw) as UnresolvedCandidateMap;

    const content = await fs.readFile(filePath, "utf-8");
    const refs = extractReferences(content);
    const currentLinks = linkMap[fileName] ?? {};
    const fileCache: Record<string, UnresolvedCandidateEntry> = {};
    let unresolvedCount = 0;
    let withCandidates = 0;

    for (const ref of refs) {
      const refNum = String(ref.num);
      if (currentLinks[refNum]) continue;
      unresolvedCount += 1;
      const cached = cache[fileName]?.[refNum];
      if (cached && cached.candidates?.length > 0 && cached.refText === ref.text) {
        fileCache[refNum] = cached;
        withCandidates += 1;
        continue;
      }
      const generated = await searchCandidatesRelaxed(ref.text);
      if (generated.candidates.length > 0) withCandidates += 1;
      fileCache[refNum] = generated;
    }

    if (Object.keys(fileCache).length > 0) cache[fileName] = fileCache;
    else delete cache[fileName];

    await fs.writeFile(CANDIDATES_FILE, JSON.stringify(cache, null, 2), "utf-8");
    res.json({
      ok: true,
      fileName,
      unresolvedCount,
      withCandidates,
      candidates: cache,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get("/api/zotero/search", async (req, res) => {
  try {
    const q = String(req.query.q ?? "").trim();
    if (!q) {
      res.json({ items: [] });
      return;
    }
    const url = new URL(`https://api.zotero.org/users/${ZOTERO_USER_ID}/items`);
    url.searchParams.set("q", q);
    url.searchParams.set("itemType", "-attachment");
    url.searchParams.set("limit", "25");
    url.searchParams.set("format", "json");
    const data = (await (await zoteroFetch(url.toString())).json()) as ZoteroItem[];
    res.json({
      items: data.map((item) => ({
        key: item.key,
        title: item.data.title,
        creators: formatCreators(item.data.creators),
        date: item.data.date,
        publicationTitle: item.data.publicationTitle,
        DOI: item.data.DOI,
        abstractNote: item.data.abstractNote?.slice(0, 400),
      })),
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get("/api/zotero/item/:key", async (req, res) => {
  try {
    const url = `https://api.zotero.org/users/${ZOTERO_USER_ID}/items/${req.params.key}?format=json`;
    const item = (await (await zoteroFetch(url)).json()) as ZoteroItem;
    const childrenUrl = `https://api.zotero.org/users/${ZOTERO_USER_ID}/items/${req.params.key}/children?format=json`;
    const children = (await (await zoteroFetch(childrenUrl)).json()) as ZoteroItem[];
    const pdf = findPdfAttachment(children);
    let pdfUrl: string | null = null;
    let pdfSource: "zotero_file" | "external_url" | null = null;
    if (pdf) {
      if (pdf.data.linkMode === "imported_url" && pdf.data.url) {
        pdfUrl = pdf.data.url;
        pdfSource = "external_url";
      } else {
        pdfUrl = `/api/zotero/item/${req.params.key}/pdf`;
        pdfSource = "zotero_file";
      }
    }
    res.json({
      key: item.key,
      title: item.data.title,
      creators: formatCreators(item.data.creators),
      date: item.data.date,
      publicationTitle: item.data.publicationTitle,
      DOI: item.data.DOI,
      url: item.data.url,
      abstractNote: item.data.abstractNote ?? "",
      hasPdf: Boolean(pdfUrl),
      pdfAttachmentKey: pdf?.key ?? null,
      pdfUrl,
      pdfSource,
    });
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

app.get("/api/zotero/item/:key/pdf", async (req, res) => {
  try {
    const childrenUrl = `https://api.zotero.org/users/${ZOTERO_USER_ID}/items/${req.params.key}/children?format=json`;
    const children = (await (await zoteroFetch(childrenUrl)).json()) as ZoteroItem[];
    const pdf = findPdfAttachment(children);
    if (!pdf) {
      res.status(404).json({ error: "No PDF attachment" });
      return;
    }
    if (pdf.data.linkMode === "imported_url" && pdf.data.url) {
      res.redirect(pdf.data.url);
      return;
    }
    const fileUrl = `https://api.zotero.org/users/${ZOTERO_USER_ID}/items/${pdf.key}/file`;
    const fileRes = await fetch(fileUrl, { headers: zoteroHeaders() });
    if (fileRes.status === 404 && pdf.data.url) {
      res.redirect(pdf.data.url);
      return;
    }
    if (!fileRes.ok) {
      const text = await fileRes.text();
      throw new Error(`Zotero API ${fileRes.status}: ${text.slice(0, 300)}`);
    }
    const buffer = Buffer.from(await fileRes.arrayBuffer());
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader(
      "Content-Disposition",
      `inline; filename="${encodeURIComponent(pdf.data.filename ?? "document.pdf")}"`,
    );
    res.send(buffer);
  } catch (e) {
    res.status(500).json({ error: String(e) });
  }
});

if (process.env.NODE_ENV === "production") {
  const distPath = path.join(__dirname, "../dist");
  app.use(express.static(distPath));
  app.get("*", (_req, res) => {
    res.sendFile(path.join(distPath, "index.html"), (err) => {
      if (err) res.status(404).send("Build missing. Run npm run build.");
    });
  });
}

app.listen(PORT, () => {
  console.log(`GA Consensus Editor API http://localhost:${PORT}`);
  console.log(`Manuscripts: ${GA_DIR}`);
});

type ZoteroCreator = { creatorType?: string; firstName?: string; lastName?: string; name?: string };
type ZoteroItem = {
  key: string;
  data: {
    itemType: string;
    title?: string;
    creators?: ZoteroCreator[];
    date?: string;
    publicationTitle?: string;
    journalAbbreviation?: string;
    volume?: string;
    issue?: string;
    pages?: string;
    DOI?: string;
    url?: string;
    abstractNote?: string;
    contentType?: string;
    filename?: string;
    linkMode?: string;
  };
};
type CandidateHit = {
  key: string;
  title?: string;
  creators?: string;
  date?: string;
  publicationTitle?: string;
  DOI?: string;
  abstractNote?: string;
};
type UnresolvedCandidateEntry = {
  refText: string;
  queries: string[];
  generatedAt: string;
  candidates: CandidateHit[];
};
type UnresolvedCandidateMap = Record<string, Record<string, UnresolvedCandidateEntry>>;

function formatCreators(creators?: ZoteroCreator[]): string {
  if (!creators?.length) return "";
  return creators
    .map((c) => c.name ?? [c.lastName, c.firstName].filter(Boolean).join(", "))
    .join("; ");
}

function findPdfAttachment(children: ZoteroItem[]): ZoteroItem | undefined {
  return children.find(
    (c) =>
      c.data.itemType === "attachment" &&
      (c.data.contentType === "application/pdf" || c.data.filename?.endsWith(".pdf")),
  );
}

function formatVancouver(item: ZoteroItem): string {
  const d = item.data;
  const authors = formatVancouverAuthors(d.creators);
  const title = (d.title ?? "").trim().replace(/\.+$/, "");
  const journal = (d.journalAbbreviation || d.publicationTitle || "").trim().replace(/\.+$/, "");
  const year = extractYear(d.date);
  const volume = (d.volume ?? "").trim();
  const issue = (d.issue ?? "").trim();
  const pages = (d.pages ?? "").trim();
  const doi = (d.DOI ?? "").trim();
  const url = (d.url ?? "").trim();

  const volIssue = volume ? `${volume}${issue ? `(${issue})` : ""}` : "";
  const yearVol = year && volIssue ? `${year};${volIssue}` : year || volIssue;
  const yearVolPages = yearVol && pages ? `${yearVol}:${pages}` : yearVol || pages;

  const parts = [
    authors || undefined,
    title ? `${title}.` : undefined,
    journal ? `${journal}.` : undefined,
    yearVolPages ? `${yearVolPages}.` : undefined,
    doi ? `[doi:${doi}](https://doi.org/${doi}).` : undefined,
    !doi && url ? `[Available from](${url}).` : undefined,
  ].filter(Boolean);
  return parts.join(" ");
}

function formatVancouverAuthors(creators?: ZoteroCreator[]): string {
  const authors = (creators ?? []).filter((c) => c.creatorType === "author");
  if (authors.length === 0) return "";
  const formatted = authors.map((c) => {
    if (c.name) return c.name.trim();
    const last = (c.lastName ?? "").trim();
    const initials = (c.firstName ?? "")
      .split(/\s+/)
      .filter(Boolean)
      .map((s) => s[0]?.toUpperCase() ?? "")
      .join("");
    return `${last} ${initials}`.trim();
  });
  if (formatted.length > 6) return `${formatted.slice(0, 6).join(", ")}, et al.`;
  return `${formatted.join(", ")}.`;
}

function extractYear(date?: string): string {
  if (!date) return "";
  const m = date.match(/\b(19|20)\d{2}\b/);
  return m ? m[0] : "";
}

function rewriteReferenceLine(
  markdown: string,
  refNum: number,
  replacement: string,
): { changed: boolean; content: string } {
  const sec = markdown.match(/##\s*参考文献\s*\n([\s\S]*?)(?=\n##\s|\n---\s*$|$)/);
  if (!sec || sec.index === undefined) return { changed: false, content: markdown };
  const body = sec[1];
  const target = new RegExp(`^${refNum}\\.\\s+.+$`, "m");
  if (!target.test(body)) return { changed: false, content: markdown };
  const newBody = body.replace(target, replacement);
  const start = sec.index + sec[0].indexOf(body);
  const end = start + body.length;
  return { changed: true, content: markdown.slice(0, start) + newBody + markdown.slice(end) };
}

type ParsedReference = { num: number; text: string };

function extractReferences(markdown: string): ParsedReference[] {
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

function buildSearchQuery(text: string): string {
  const cleaned = text.replace(/\*[^*]+\*/g, " ").replace(/\s+/g, " ").trim();
  let titlePart = cleaned.replace(/^[^.]+\bet\s+al\.?\s*/i, "").trim();
  if (!titlePart || titlePart.length < 12) {
    const afterFirstDot = cleaned.split(/\.\s+/).slice(1).join(" ");
    titlePart = afterFirstDot || cleaned;
  }
  titlePart = titlePart.replace(/\s*\d{4}[;:,].*$/, "").trim();
  return titlePart.slice(0, 180);
}

function buildFallbackSearchQuery(text: string): string {
  const cleaned = text.replace(/\*[^*]+\*/g, " ").replace(/\s+/g, " ").trim();
  const author = cleaned.match(/^([A-Z][a-zA-Z-]+)/)?.[1] ?? "";
  const keywords = buildSearchQuery(text)
    .split(/\W+/)
    .filter((w) => w.length > 4)
    .slice(0, 6)
    .join(" ");
  return [author, keywords].filter(Boolean).join(" ").trim();
}

async function searchFirstZoteroKey(query: string): Promise<string | null> {
  const q = query.trim();
  if (!q) return null;
  try {
    const url = new URL(`https://api.zotero.org/users/${ZOTERO_USER_ID}/items`);
    url.searchParams.set("q", q);
    url.searchParams.set("itemType", "-attachment");
    url.searchParams.set("limit", "5");
    url.searchParams.set("format", "json");
    const data = (await (await zoteroFetch(url.toString())).json()) as ZoteroItem[];
    return data[0]?.key ?? null;
  } catch {
    return null;
  }
}

async function searchCandidatesRelaxed(refText: string): Promise<UnresolvedCandidateEntry> {
  const primary = buildSearchQuery(refText);
  const fallback = buildFallbackSearchQuery(refText);
  const veryBroad = buildVeryBroadQuery(refText);
  const queries = [primary, fallback, veryBroad].filter(Boolean);

  const byKey = new Map<string, CandidateHit>();

  for (const q of queries) {
    const url = new URL(`https://api.zotero.org/users/${ZOTERO_USER_ID}/items`);
    url.searchParams.set("q", q);
    url.searchParams.set("itemType", "-attachment");
    url.searchParams.set("limit", "12");
    url.searchParams.set("format", "json");
    try {
      const data = (await (await zoteroFetch(url.toString())).json()) as ZoteroItem[];
      for (const item of data) {
        if (byKey.has(item.key)) continue;
        byKey.set(item.key, {
          key: item.key,
          title: item.data.title,
          creators: formatCreators(item.data.creators),
          date: item.data.date,
          publicationTitle: item.data.publicationTitle,
          DOI: item.data.DOI,
          abstractNote: item.data.abstractNote?.slice(0, 250),
        });
        if (byKey.size >= 10) break;
      }
    } catch {
      // Ignore per-query failures, keep best-effort behavior.
    }
    if (byKey.size >= 10) break;
  }

  return {
    refText,
    queries,
    generatedAt: new Date().toISOString(),
    candidates: [...byKey.values()],
  };
}

function buildVeryBroadQuery(text: string): string {
  const cleaned = text.replace(/\*[^*]+\*/g, " ").replace(/\s+/g, " ").trim();
  const author = cleaned.match(/^([A-Z][a-zA-Z-]+)/)?.[1] ?? "";
  const keywords = cleaned
    .split(/\W+/)
    .filter((w) => w.length > 5)
    .slice(0, 4)
    .join(" ");
  return [author, keywords].filter(Boolean).join(" ").trim();
}
