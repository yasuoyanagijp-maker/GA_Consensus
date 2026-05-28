export type ZoteroSearchHit = {
  key: string;
  title?: string;
  creators?: string;
  date?: string;
  publicationTitle?: string;
  DOI?: string;
  abstractNote?: string;
};

export type ZoteroItemDetail = {
  key: string;
  title?: string;
  creators?: string;
  date?: string;
  publicationTitle?: string;
  DOI?: string;
  url?: string;
  abstractNote: string;
  hasPdf: boolean;
  pdfAttachmentKey: string | null;
  pdfUrl: string | null;
  pdfSource?: "zotero_file" | "external_url" | null;
};

export type CitationLinkMap = Record<string, Record<string, string>>;
export type AutoLinkResult = {
  ok: boolean;
  files: number;
  added: number;
  skipped: number;
  unresolved: number;
  links: CitationLinkMap;
};
export type UnresolvedCandidateEntry = {
  refText: string;
  queries: string[];
  generatedAt: string;
  candidates: ZoteroSearchHit[];
};
export type UnresolvedCandidateMap = Record<string, Record<string, UnresolvedCandidateEntry>>;

async function json<T>(res: Promise<Response>): Promise<T> {
  const r = await res;
  if (!r.ok) {
    const err = await r.json().catch(() => ({ error: r.statusText }));
    throw new Error((err as { error?: string }).error ?? r.statusText);
  }
  return r.json() as Promise<T>;
}

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, "") ?? "";
const apiUrl = (path: string) => `${API_BASE_URL}${path}`;

export const api = {
  health: () => json<{ ok: boolean; zoteroConfigured: boolean }>(fetch(apiUrl("/api/health"))),
  listFiles: () => json<{ files: string[] }>(fetch(apiUrl("/api/files"))),
  getFile: (name: string) =>
    json<{ name: string; content: string }>(fetch(apiUrl(`/api/files/${encodeURIComponent(name)}`))),
  saveFile: (name: string, content: string) =>
    json<{ ok: boolean }>(
      fetch(apiUrl(`/api/files/${encodeURIComponent(name)}`), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content }),
      }),
    ),
  syncReferenceWithZotero: (name: string, refNum: number, key: string) =>
    json<{ ok: boolean; citation: string }>(
      fetch(apiUrl(`/api/files/${encodeURIComponent(name)}/references/${refNum}/sync-from-zotero`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key }),
      }),
    ),
  getCitationLinks: () => json<CitationLinkMap>(fetch(apiUrl("/api/citation-links"))),
  saveCitationLinks: (map: CitationLinkMap) =>
    json<{ ok: boolean }>(
      fetch(apiUrl("/api/citation-links"), {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(map),
      }),
    ),
  autoLinkAllCitations: () =>
    json<AutoLinkResult>(
      fetch(apiUrl("/api/citation-links/auto-link-all"), {
        method: "POST",
      }),
    ),
  getUnresolvedCandidates: () =>
    json<UnresolvedCandidateMap>(fetch(apiUrl("/api/citation-links/unresolved-candidates"))),
  generateUnresolvedCandidates: () =>
    json<{
      ok: boolean;
      unresolvedCount: number;
      withCandidates: number;
      candidates: UnresolvedCandidateMap;
    }>(
      fetch(apiUrl("/api/citation-links/unresolved-candidates/generate"), {
        method: "POST",
      }),
    ),
  generateUnresolvedCandidatesForFile: (fileName: string) =>
    json<{
      ok: boolean;
      fileName: string;
      unresolvedCount: number;
      withCandidates: number;
      candidates: UnresolvedCandidateMap;
    }>(
      fetch(apiUrl("/api/citation-links/unresolved-candidates/generate-for-file"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ fileName }),
      }),
    ),
  searchZotero: (q: string) =>
    json<{ items: ZoteroSearchHit[] }>(fetch(apiUrl(`/api/zotero/search?q=${encodeURIComponent(q)}`))),
  getZoteroItem: (key: string) =>
    json<ZoteroItemDetail>(fetch(apiUrl(`/api/zotero/item/${encodeURIComponent(key)}`))),
  pdfUrl: (key: string) => apiUrl(`/api/zotero/item/${key}/pdf`),
};
