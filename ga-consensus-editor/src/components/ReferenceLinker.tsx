import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  api,
  type CitationLinkMap,
  type UnresolvedCandidateMap,
  type ZoteroSearchHit,
} from "../lib/api";
import {
  type ParsedReference,
  fallbackSearchQueryFromReference,
  searchQueryFromReference,
} from "../lib/markdown";
import { SearchProgress } from "./SearchProgress";

type Props = {
  fileName: string;
  references: ParsedReference[];
  citationNumbers: number[];
  links: CitationLinkMap;
  onLinksChange: (next: CitationLinkMap) => void;
  onOpenZotero: (key: string) => void;
  onReferenceSynced?: (num: number, key: string) => Promise<void> | void;
  onJumpToCitation?: (num: number) => void;
};

export function ReferenceLinker({
  fileName,
  references,
  citationNumbers,
  links,
  onLinksChange,
  onOpenZotero,
  onReferenceSynced,
  onJumpToCitation,
}: Props) {
  const unresolvedToggleKey = "ga-editor-show-unresolved-only";
  const fileLinks = links[fileName] ?? {};
  const [activeNum, setActiveNum] = useState<number | null>(null);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<ZoteroSearchHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [searchStatus, setSearchStatus] = useState<string | null>(null);
  const [showUnresolvedOnly, setShowUnresolvedOnly] = useState(() => {
    try {
      const raw = window.localStorage.getItem(unresolvedToggleKey);
      if (raw === null) return true;
      return raw === "1";
    } catch {
      return true;
    }
  });
  const [candidateMap, setCandidateMap] = useState<UnresolvedCandidateMap>({});
  const [candidateLoading, setCandidateLoading] = useState(false);
  const [candidateStatus, setCandidateStatus] = useState<string | null>(null);
  const searchPanelRef = useRef<HTMLDivElement | null>(null);
  const searchGenRef = useRef(0);
  const unresolvedRefs = useMemo(
    () => references.filter((ref) => !fileLinks[String(ref.num)]),
    [references, fileLinks],
  );
  const fileCandidates = candidateMap[fileName] ?? {};
  const referenceNumberSet = useMemo(() => new Set(references.map((r) => r.num)), [references]);
  const missingCitationNums = useMemo(
    () => citationNumbers.filter((n) => !referenceNumberSet.has(n)),
    [citationNumbers, referenceNumberSet],
  );
  const displayedRefs = useMemo(() => {
    const base = showUnresolvedOnly ? unresolvedRefs : references;
    return [...base].sort((a, b) => {
      const aUnresolved = !fileLinks[String(a.num)];
      const bUnresolved = !fileLinks[String(b.num)];
      const aHasCandidates = (fileCandidates[String(a.num)]?.candidates?.length ?? 0) > 0;
      const bHasCandidates = (fileCandidates[String(b.num)]?.candidates?.length ?? 0) > 0;

      // 1) unresolved first
      if (aUnresolved !== bUnresolved) return aUnresolved ? -1 : 1;
      // 2) within unresolved, no-candidate first
      if (aUnresolved && bUnresolved && aHasCandidates !== bHasCandidates) {
        return aHasCandidates ? 1 : -1;
      }
      // 3) stable by reference number
      return a.num - b.num;
    });
  }, [showUnresolvedOnly, unresolvedRefs, references, fileLinks, fileCandidates]);

  useEffect(() => {
    try {
      window.localStorage.setItem(unresolvedToggleKey, showUnresolvedOnly ? "1" : "0");
    } catch {
      // ignore storage errors
    }
  }, [showUnresolvedOnly]);

  useEffect(() => {
    if (unresolvedRefs.length === 0 && showUnresolvedOnly) {
      setShowUnresolvedOnly(false);
    }
  }, [unresolvedRefs.length, showUnresolvedOnly]);

  useEffect(() => {
    api
      .getUnresolvedCandidates()
      .then((data) => setCandidateMap(data))
      .catch(() => {
        // best effort
      });
  }, []);

  useEffect(() => {
    if (!fileName) return;
    if (unresolvedRefs.length === 0) return;
    const timer = window.setTimeout(() => {
      void api
        .generateUnresolvedCandidatesForFile(fileName)
        .then((r) => {
          setCandidateMap(r.candidates);
          setCandidateStatus(
            `未解決候補を更新: ${r.unresolvedCount} 件中 ${r.withCandidates} 件に候補`,
          );
        })
        .catch(() => {
          // best effort
        });
    }, 500);
    return () => window.clearTimeout(timer);
  }, [fileName, unresolvedRefs.length, references]);

  const refreshUnresolvedCandidates = async () => {
    setCandidateLoading(true);
    setCandidateStatus("未解決文献の候補を生成中…");
    try {
      const r = await api.generateUnresolvedCandidates();
      setCandidateMap(r.candidates);
      setCandidateStatus(`候補生成完了: 未解決 ${r.unresolvedCount} 件中 ${r.withCandidates} 件に候補あり`);
    } catch (e) {
      setCandidateStatus(`候補生成エラー: ${e}`);
    } finally {
      setCandidateLoading(false);
    }
  };

  const runSearch = useCallback(async (q: string, refNum: number) => {
    const trimmed = q.trim();
    if (!trimmed) {
      setSearchError("検索キーワードが空です。下の欄にタイトルや著者名を入力してください。");
      setHits([]);
      return;
    }

    const gen = ++searchGenRef.current;
    setSearching(true);
    setSearchError(null);
    setSearchStatus(null);
    setHits([]);

    try {
      let items: ZoteroSearchHit[] = [];
      let usedQuery = trimmed;

      const primary = await api.searchZotero(trimmed);
      if (gen !== searchGenRef.current) return;
      items = primary.items;

      if (items.length === 0) {
        const ref = references.find((r) => r.num === refNum);
        const fallback = ref ? fallbackSearchQueryFromReference(ref.text) : "";
        if (fallback && fallback !== trimmed) {
          setSearchStatus("別のキーワードでも再検索しています…");
          const second = await api.searchZotero(fallback);
          if (gen !== searchGenRef.current) return;
          items = second.items;
          usedQuery = fallback;
        }
      }

      setHits(items);
      if (items.length === 0) {
        setSearchStatus(`「${usedQuery}」に一致する項目は見つかりませんでした。キーワードを変えて再検索してください。`);
      } else {
        setSearchStatus(`${items.length} 件の候補を表示しています（検索語: ${usedQuery}）`);
      }
    } catch (e) {
      if (gen !== searchGenRef.current) return;
      setSearchError(String(e));
      setHits([]);
      setSearchStatus(null);
    } finally {
      if (gen === searchGenRef.current) setSearching(false);
    }
  }, [references]);

  const openSearchForRef = (ref: ParsedReference) => {
    const q = searchQueryFromReference(ref.text);
    setActiveNum(ref.num);
    setQuery(q);
    setHits([]);
    setSearchError(null);
    setSearchStatus(null);

    requestAnimationFrame(() => {
      searchPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });

    void runSearch(q, ref.num);
  };

  useEffect(() => {
    if (activeNum === null) return;
    const panel = searchPanelRef.current;
    if (panel) panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [activeNum, searching]);

  const linkItem = async (num: number, key: string) => {
    const next = {
      ...links,
      [fileName]: { ...fileLinks, [String(num)]: key },
    };
    await api.saveCitationLinks(next);
    if (onReferenceSynced) {
      await onReferenceSynced(num, key);
    }
    onLinksChange(next);
    if (candidateMap[fileName]?.[String(num)]) {
      const nextMap: UnresolvedCandidateMap = { ...candidateMap };
      const byFile = { ...(nextMap[fileName] ?? {}) };
      delete byFile[String(num)];
      nextMap[fileName] = byFile;
      setCandidateMap(nextMap);
    }
    setActiveNum(null);
    setHits([]);
    setSearchStatus(null);
  };

  const unlink = async (num: number) => {
    const nextFile = { ...fileLinks };
    delete nextFile[String(num)];
    const next = { ...links, [fileName]: nextFile };
    await api.saveCitationLinks(next);
    onLinksChange(next);
  };

  return (
    <div className="ref-linker">
      <h2>文献リンク（Zotero）</h2>
      <p className="muted small">
        未リンクの文献で「Zotero で検索・リンク」を押すと、参考文献のタイトルから自動検索し、候補が下に表示されます。
      </p>
      {unresolvedRefs.length > 0 && (
        <div className="ref-summary">
          <span className="small">
            未解決 {unresolvedRefs.length} / 全 {references.length}
          </span>
          <label className="small ref-summary__toggle">
            <input
              type="checkbox"
              checked={showUnresolvedOnly}
              onChange={(e) => setShowUnresolvedOnly(e.target.checked)}
            />
            未解決のみ表示
          </label>
        </div>
      )}
      <div className="ref-summary ref-summary--secondary">
        <button
          type="button"
          className="btn"
          onClick={() => void refreshUnresolvedCandidates()}
          disabled={candidateLoading}
        >
          {candidateLoading ? "候補生成中…" : "未解決候補を更新"}
        </button>
        {candidateStatus && <span className="small muted">{candidateStatus}</span>}
      </div>

      {missingCitationNums.length > 0 && (
        <div className="ref-missing">
          <p className="small error">
            本文に参照番号があるが、参考文献リストに未定義:{" "}
            {missingCitationNums.map((n) => `[${n}]`).join(", ")}
          </p>
          <p className="small muted">
            一時対応として、当該章の既存参考文献を表示しています。クリックしてリンク状態を確認し、必要なら参考文献番号を本文側で修正してください。
          </p>
          <div className="ref-missing__links">
            {references.map((ref) => {
              const key = fileLinks[String(ref.num)];
              return (
                <button
                  key={`fallback-${ref.num}`}
                  type="button"
                  className="btn-ghost ref-chip"
                  onClick={() => {
                    onJumpToCitation?.(ref.num);
                    if (key) onOpenZotero(key);
                    else openSearchForRef(ref);
                  }}
                  title={ref.text}
                >
                  [{ref.num}]
                </button>
              );
            })}
          </div>
        </div>
      )}

      <ul className="ref-list">
        {displayedRefs.map((ref) => {
          const key = fileLinks[String(ref.num)];
          const isActive = activeNum === ref.num;
          return (
            <li key={ref.num} className={`ref-item${isActive ? " ref-item--active" : ""}`}>
              <div className="ref-item__head">
                <span className="ref-num">[{ref.num}]</span>
                {key ? (
                  <>
                    <button type="button" className="btn-link" onClick={() => onOpenZotero(key)}>
                      Zotero で開く
                    </button>
                    <button type="button" className="btn-ghost" onClick={() => unlink(ref.num)}>
                      解除
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    className="btn"
                    disabled={searching && isActive}
                    onClick={() => openSearchForRef(ref)}
                  >
                    {searching && isActive ? "検索中…" : "Zotero で検索・リンク"}
                  </button>
                )}
              </div>
              <p className="ref-text">{ref.text}</p>
              {!key && fileCandidates[String(ref.num)]?.candidates?.length > 0 && (
                <div className="candidate-box">
                  <p className="small search-ok">
                    緩い検索候補（再起動後も保持）: {fileCandidates[String(ref.num)].candidates.length} 件
                  </p>
                  <ul className="hit-list">
                    {fileCandidates[String(ref.num)].candidates.map((hit) => (
                      <li key={hit.key}>
                        <button
                          type="button"
                          className="hit-btn"
                          onClick={() => void linkItem(ref.num, hit.key)}
                        >
                          <strong>{hit.title ?? "（無題）"}</strong>
                          <span className="muted small">
                            {[hit.creators, hit.date, hit.publicationTitle].filter(Boolean).join(" · ")}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {isActive && (
                <div className="ref-search" ref={searchPanelRef}>
                  <label className="ref-search__label small">検索キーワード（編集可）</label>
                  <div className="ref-search__row">
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !searching) void runSearch(query, ref.num);
                      }}
                      disabled={searching}
                      placeholder="論文タイトルや著者名…"
                    />
                    <button
                      type="button"
                      className="btn"
                      onClick={() => void runSearch(query, ref.num)}
                      disabled={searching || !query.trim()}
                    >
                      再検索
                    </button>
                  </div>

                  {searching && <SearchProgress />}

                  {!searching && searchError && <p className="error small">{searchError}</p>}
                  {!searching && searchStatus && !searchError && (
                    <p className={`small ${hits.length ? "search-ok" : "search-muted"}`}>{searchStatus}</p>
                  )}

                  {!searching && hits.length > 0 && (
                    <ul className="hit-list">
                      {hits.map((hit) => (
                        <li key={hit.key}>
                          <button
                            type="button"
                            className="hit-btn"
                            onClick={() => void linkItem(ref.num, hit.key)}
                          >
                            <strong>{hit.title ?? "（無題）"}</strong>
                            <span className="muted small">
                              {[hit.creators, hit.date, hit.publicationTitle].filter(Boolean).join(" · ")}
                            </span>
                            {hit.abstractNote && (
                              <span className="hit-abstract muted small">{hit.abstractNote}…</span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {references.length === 0 && (
        <p className="muted">「## 参考文献」セクションが見つかりません。原稿末尾に番号付きリストがあるか確認してください。</p>
      )}
      {references.length > 0 && showUnresolvedOnly && unresolvedRefs.length === 0 && (
        <p className="search-ok small">未解決文献はありません。すべてリンク済みです。</p>
      )}
    </div>
  );
}
