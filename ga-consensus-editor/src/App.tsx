import MDEditor, { commands } from "@uiw/react-md-editor";
import MDPreview from "@uiw/react-markdown-preview";
import "@uiw/react-md-editor/markdown-editor.css";
import "@uiw/react-markdown-preview/markdown.css";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ZoteroPanel } from "./components/ZoteroPanel";
import { ReferenceLinker } from "./components/ReferenceLinker";
import { RequirementsMapPanel } from "./components/RequirementsMapPanel";
import { api, type CitationLinkMap } from "./lib/api";
import { extractCitationNumbers, linkifyCitationsSimple, parseReferences } from "./lib/markdown";
import { REQUIREMENT_MAP } from "./lib/requirementsMap";
import "./App.css";

const READ_ONLY = (import.meta.env.VITE_READ_ONLY as string | undefined) === "1";

export default function App() {
  const layoutKeyEditor = "ga-editor-split-percent";
  const layoutKeySide = "ga-editor-side-width";
  const [files, setFiles] = useState<string[]>([]);
  const [currentFile, setCurrentFile] = useState<string | null>(null);
  const [content, setContent] = useState("");
  const [savedContent, setSavedContent] = useState("");
  const [links, setLinks] = useState<CitationLinkMap>({});
  const [zoteroKey, setZoteroKey] = useState<string | null>(null);
  const [sidebar, setSidebar] = useState<"refs" | "zotero" | "requirements">(READ_ONLY ? "requirements" : "refs");
  const [status, setStatus] = useState("");
  const [loading, setLoading] = useState(true);
  const [editorSplitPercent, setEditorSplitPercent] = useState<number>(() => {
    const n = Number(window.localStorage.getItem(layoutKeyEditor));
    return Number.isFinite(n) && n >= 20 && n <= 80 ? n : 50;
  });
  const [sidePaneWidth, setSidePaneWidth] = useState<number>(() => {
    const n = Number(window.localStorage.getItem(layoutKeySide));
    return Number.isFinite(n) && n >= 280 && n <= 700 ? n : 340;
  });
  const dragModeRef = useRef<"editor" | "side" | null>(null);
  const editorSplitRef = useRef<HTMLElement | null>(null);
  const workspaceRef = useRef<HTMLDivElement | null>(null);
  const editorRootRef = useRef<HTMLDivElement | null>(null);
  const previewScrollRef = useRef<HTMLDivElement | null>(null);
  const lastFindQueryRef = useRef<string>("");
  const lastFindPosRef = useRef<number>(0);

  const dirty = content !== savedContent;
  const references = useMemo(() => parseReferences(content), [content]);
  const citationNumbers = useMemo(() => extractCitationNumbers(content), [content]);
  const orderedFiles = useMemo(() => {
    const order = new Map(REQUIREMENT_MAP.map((r, i) => [r.file, i]));
    return [...files].sort((a, b) => {
      const ai = order.has(a) ? (order.get(a) as number) : Number.MAX_SAFE_INTEGER;
      const bi = order.has(b) ? (order.get(b) as number) : Number.MAX_SAFE_INTEGER;
      if (ai !== bi) return ai - bi;
      return a.localeCompare(b, "ja");
    });
  }, [files]);

  const previewMarkdown = useMemo(() => {
    if (!currentFile) return content;
    return linkifyCitationsSimple(content, currentFile, links);
  }, [content, currentFile, links]);

  useEffect(() => {
    window.localStorage.setItem(layoutKeyEditor, String(editorSplitPercent));
  }, [editorSplitPercent]);

  useEffect(() => {
    window.localStorage.setItem(layoutKeySide, String(sidePaneWidth));
  }, [sidePaneWidth]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (dragModeRef.current === "editor" && editorSplitRef.current) {
        const rect = editorSplitRef.current.getBoundingClientRect();
        const pct = ((e.clientX - rect.left) / rect.width) * 100;
        setEditorSplitPercent(Math.min(80, Math.max(20, pct)));
      }
      if (dragModeRef.current === "side" && workspaceRef.current) {
        const rect = workspaceRef.current.getBoundingClientRect();
        const width = rect.right - e.clientX;
        setSidePaneWidth(Math.min(700, Math.max(280, width)));
      }
    };
    const onUp = () => {
      dragModeRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, []);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const isFind = (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "f";
      if (!isFind) return;
      e.preventDefault();

      const initial = lastFindQueryRef.current;
      const q = window.prompt("エディタ内検索", initial) ?? "";
      const query = q.trim();
      if (!query) return;

      const lower = content.toLowerCase();
      const needle = query.toLowerCase();

      let startPos = 0;
      if (query === lastFindQueryRef.current) {
        startPos = Math.max(0, lastFindPosRef.current + 1);
      }
      let idx = lower.indexOf(needle, startPos);
      if (idx < 0) idx = lower.indexOf(needle, 0);
      if (idx < 0) {
        setStatus(`見つかりません: ${query}`);
        return;
      }

      lastFindQueryRef.current = query;
      lastFindPosRef.current = idx;

      const textarea = editorRootRef.current?.querySelector("textarea");
      if (textarea instanceof HTMLTextAreaElement) {
        textarea.focus();
        textarea.setSelectionRange(idx, idx + query.length);
        textarea.scrollTop = Math.max(0, textarea.scrollHeight * ((idx / Math.max(1, content.length)) - 0.2));
      }
      setStatus(`検索: "${query}" (${idx + 1} 文字目)`);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [content]);

  const loadFile = useCallback(async (name: string) => {
    setLoading(true);
    setStatus("");
    try {
      const { content: text } = await api.getFile(name);
      setCurrentFile(name);
      setContent(text);
      setSavedContent(text);
    } catch (e) {
      setStatus(`読み込みエラー: ${e}`);
    } finally {
      setLoading(false);
    }
  }, []);

  const reloadCurrentFile = useCallback(async () => {
    if (!currentFile) return;
    const { content: text } = await api.getFile(currentFile);
    setContent(text);
    setSavedContent(text);
  }, [currentFile]);

  useEffect(() => {
    Promise.all([api.listFiles(), api.getCitationLinks(), api.health()])
      .then(([fileRes, linkMap, health]) => {
        setFiles(fileRes.files);
        setLinks(linkMap);
        if (!health.zoteroConfigured) {
          setStatus("Zotero API 未設定: .env.local を確認してください");
        }
        if (fileRes.files.length) {
          const preferredFirst = REQUIREMENT_MAP[0]?.file;
          const initialFile = preferredFirst && fileRes.files.includes(preferredFirst)
            ? preferredFirst
            : fileRes.files[0];
          loadFile(initialFile);
        }

        if (health.zoteroConfigured && !READ_ONLY) {
          setStatus("起動時に文献リンクを自動紐付け中…");
          void api
            .autoLinkAllCitations()
            .then((r) => {
              setLinks(r.links);
              setStatus(
                `自動紐付け完了: 追加 ${r.added} / 既存 ${r.skipped} / 未解決 ${r.unresolved}`,
              );
              setTimeout(() => setStatus(""), 5000);
            })
            .catch((e) => setStatus(`自動紐付けエラー: ${e}`));
        }
      })
      .catch((e) => setStatus(String(e)))
      .finally(() => setLoading(false));
  }, [loadFile]);

  const save = async () => {
    if (READ_ONLY) return;
    if (!currentFile) return;
    setStatus("保存中…");
    try {
      await api.saveFile(currentFile, content);
      setSavedContent(content);
      setStatus("保存しました");
      setTimeout(() => setStatus(""), 2000);
    } catch (e) {
      setStatus(`保存エラー: ${e}`);
    }
  };

  const handlePreviewClick = (e: React.MouseEvent) => {
    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor || !currentFile) return;
    const href = anchor.getAttribute("href") ?? "";
    const zMatch = href.match(/^#zotero-(.+)$/);
    if (zMatch) {
      e.preventDefault();
      setZoteroKey(zMatch[1]);
      setSidebar("zotero");
      return;
    }
    const citeMatch = href.match(/^#cite-(\d+)$/);
    if (citeMatch) {
      e.preventDefault();
      setSidebar("refs");
    }
  };

  const jumpToCitation = useCallback((num: number) => {
    // 1) Move editor caret to first citation occurrence that includes this number.
    const citeRe = /\[(\d+(?:\s*,\s*\d+)*)\]/g;
    let match: RegExpExecArray | null;
    let start = -1;
    let end = -1;
    while ((match = citeRe.exec(content)) !== null) {
      const nums = match[1]
        .split(",")
        .map((s) => Number(s.trim()))
        .filter((n) => Number.isFinite(n));
      if (nums.includes(num)) {
        start = match.index;
        end = match.index + match[0].length;
        break;
      }
    }
    if (start >= 0 && end > start) {
      const textarea = editorRootRef.current?.querySelector("textarea");
      if (textarea instanceof HTMLTextAreaElement) {
        textarea.focus();
        textarea.setSelectionRange(start, end);
        textarea.scrollTop = Math.max(
          0,
          textarea.scrollHeight * ((start / Math.max(1, content.length)) - 0.2),
        );
      }
    }

    // 2) Scroll preview to matching citation link and highlight it.
    const root = previewScrollRef.current;
    if (root) {
      const all = Array.from(root.querySelectorAll("a"));
      all.forEach((a) => a.classList.remove("citation-focus"));
      const target = all.find((a) => {
        const t = (a.textContent ?? "").trim().replace(/\[|\]/g, "");
        return t === String(num);
      });
      if (target) {
        target.classList.add("citation-focus");
        target.scrollIntoView({ behavior: "smooth", block: "center" });
        window.setTimeout(() => target.classList.remove("citation-focus"), 1800);
      }
    }
    setStatus(`引用 [${num}] へ移動`);
  }, [content]);

  return (
    <div className="app" data-color-mode="light">
      <header className="toolbar">
        <div className="toolbar__brand">
          <span className="logo">GA Consensus Editor</span>
          <span className="muted small">01_drafts/ga_consensus</span>
        </div>
        <select
          value={currentFile ?? ""}
          onChange={(e) => {
            if (!READ_ONLY && dirty && !confirm("未保存の変更があります。切り替えますか？")) return;
            loadFile(e.target.value);
          }}
          disabled={loading}
        >
          {orderedFiles.map((f) => (
            <option key={f} value={f}>
              {f}
            </option>
          ))}
        </select>
        {!READ_ONLY && (
          <button type="button" className="btn primary" onClick={save} disabled={!dirty || !currentFile}>
            保存 {dirty ? "*" : ""}
          </button>
        )}
        {READ_ONLY && <span className="muted small">公開版: 閲覧専用（編集不可）</span>}
        <span className="status">{status}</span>
      </header>

      <div
        className="workspace"
        ref={workspaceRef}
        style={{ gridTemplateColumns: `minmax(0,1fr) 6px ${sidePaneWidth}px` }}
      >
        <section
          className="editor-split"
          ref={editorSplitRef}
          style={{
            gridTemplateColumns: READ_ONLY
              ? "minmax(0,1fr)"
              : `minmax(0,${editorSplitPercent}%) 6px minmax(0,${100 - editorSplitPercent}%)`,
          }}
        >
          {!READ_ONLY && (
            <div className="editor-col">
              <div className="col-label">編集</div>
              <div ref={editorRootRef}>
                <MDEditor
                  value={content}
                  onChange={(v) => setContent(v ?? "")}
                  height="100%"
                  preview="edit"
                  visibleDragbar={false}
                  extraCommands={[commands.fullscreen]}
                  data-color-mode="light"
                />
              </div>
            </div>
          )}
          {!READ_ONLY && (
            <div
              className="splitter splitter--editor"
              onMouseDown={() => {
                dragModeRef.current = "editor";
                document.body.style.cursor = "col-resize";
                document.body.style.userSelect = "none";
              }}
            />
          )}
          <div className="preview-col" onClick={handlePreviewClick}>
            <div className="col-label">プレビュー</div>
            <div className="preview-scroll" ref={previewScrollRef}>
              <MDPreview source={previewMarkdown} />
            </div>
          </div>
        </section>
        <div
          className="splitter splitter--side"
          onMouseDown={() => {
            dragModeRef.current = "side";
            document.body.style.cursor = "col-resize";
            document.body.style.userSelect = "none";
          }}
        />

        <aside className="side-pane">
          <nav className="side-tabs">
            {!READ_ONLY && (
              <button
                type="button"
                className={sidebar === "refs" ? "tab active" : "tab"}
                onClick={() => setSidebar("refs")}
              >
                文献リンク
              </button>
            )}
            <button
              type="button"
              className={sidebar === "zotero" ? "tab active" : "tab"}
              onClick={() => setSidebar("zotero")}
            >
              Zotero
            </button>
            <button
              type="button"
              className={sidebar === "requirements" ? "tab active" : "tab"}
              onClick={() => setSidebar("requirements")}
            >
              課題名
            </button>
          </nav>
          <div className="side-body">
            {sidebar === "refs" && currentFile && (
              <ReferenceLinker
                fileName={currentFile}
                references={references}
                citationNumbers={citationNumbers}
                links={links}
                onLinksChange={setLinks}
                onJumpToCitation={jumpToCitation}
                onReferenceSynced={async (num, key) => {
                  try {
                    await api.syncReferenceWithZotero(currentFile, num, key);
                    await reloadCurrentFile();
                    setStatus(`参考文献[${num}]をVancouver形式で更新しました`);
                  } catch (e) {
                    setStatus(`参考文献更新エラー: ${e}`);
                  }
                }}
                onOpenZotero={(key) => {
                  setZoteroKey(key);
                  setSidebar("zotero");
                }}
              />
            )}
            {sidebar === "zotero" && (
              <ZoteroPanel itemKey={zoteroKey} onClose={() => setZoteroKey(null)} />
            )}
            {sidebar === "requirements" && (
              <RequirementsMapPanel
                currentFile={currentFile}
                onSelectFile={(file) => {
                  if (!READ_ONLY && dirty && !confirm("未保存の変更があります。切り替えますか？")) return;
                  loadFile(file);
                }}
              />
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
