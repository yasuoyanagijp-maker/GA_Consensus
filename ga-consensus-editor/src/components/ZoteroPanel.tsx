import { useEffect, useState } from "react";
import { api, type ZoteroItemDetail } from "../lib/api";

type Props = {
  itemKey: string | null;
  onClose: () => void;
};

export function ZoteroPanel({ itemKey, onClose }: Props) {
  const pdfWindowPrefKey = "ga-editor-pdf-open-external";
  const [item, setItem] = useState<ZoteroItemDetail | null>(null);
  const [tab, setTab] = useState<"abstract" | "pdf">("abstract");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [pdfNotice, setPdfNotice] = useState<string | null>(null);
  const [openPdfExternally, setOpenPdfExternally] = useState<boolean>(() => {
    try {
      const v = window.localStorage.getItem(pdfWindowPrefKey);
      if (v === null) return true;
      return v === "1";
    } catch {
      return true;
    }
  });

  useEffect(() => {
    if (!itemKey) {
      setItem(null);
      return;
    }
    setLoading(true);
    setError(null);
    setPdfNotice(null);
    api
      .getZoteroItem(itemKey)
      .then((data) => {
        setItem(data);
        setTab("abstract");
      })
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, [itemKey]);

  useEffect(() => {
    try {
      window.localStorage.setItem(pdfWindowPrefKey, openPdfExternally ? "1" : "0");
    } catch {
      // ignore storage errors
    }
  }, [openPdfExternally]);

  if (!itemKey) return null;

  const abstractHtml = item?.abstractNote ? sanitizeAbstractHtml(item.abstractNote) : "";

  const openPdfInNewWindow = () => {
    if (!item?.hasPdf) return;
    const url = item.pdfUrl ?? api.pdfUrl(item.key);
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (!w) {
      setPdfNotice("ポップアップがブロックされました。ブラウザ設定を確認してください。");
      return;
    }
    setPdfNotice("PDFを別ウィンドウで開きました。");
    // Keep Abstract as the default reading surface.
    setTab("abstract");
  };

  const handlePdfClick = () => {
    if (!item?.hasPdf) return;
    if (openPdfExternally) {
      openPdfInNewWindow();
      return;
    }
    setPdfNotice(null);
    setTab("pdf");
  };

  return (
    <aside className="zotero-panel">
      <header className="zotero-panel__head">
        <h2>Zotero</h2>
        <button type="button" className="btn-ghost" onClick={onClose} aria-label="閉じる">
          ×
        </button>
      </header>
      {loading && <p className="muted">読み込み中…</p>}
      {error && <p className="error">{error}</p>}
      {item && (
        <>
          <div className="zotero-meta">
            <h3>{item.title ?? "（タイトルなし）"}</h3>
            <p className="muted">
              {[item.creators, item.date, item.publicationTitle].filter(Boolean).join(" · ")}
            </p>
            {item.DOI && (
              <a href={`https://doi.org/${item.DOI}`} target="_blank" rel="noreferrer">
                DOI: {item.DOI}
              </a>
            )}
          </div>
          <div className="tabs">
            <button
              type="button"
              className={tab === "abstract" ? "tab active" : "tab"}
              onClick={() => setTab("abstract")}
            >
              Abstract
            </button>
            <button
              type="button"
              className={tab === "pdf" ? "tab active" : "tab"}
              disabled={!item.hasPdf}
              onClick={handlePdfClick}
            >
              PDF {item.hasPdf ? "" : "（なし）"}
            </button>
          </div>
          <label className="small zotero-pdf-toggle">
            <input
              type="checkbox"
              checked={openPdfExternally}
              onChange={(e) => setOpenPdfExternally(e.target.checked)}
            />
            PDFを別ウィンドウで開く
          </label>
          {pdfNotice && <p className="small muted">{pdfNotice}</p>}
          {tab === "abstract" && (
            <div className="abstract-box">
              {abstractHtml ? (
                <div
                  className="abstract-content"
                  dangerouslySetInnerHTML={{ __html: abstractHtml }}
                />
              ) : (
                <p className="muted">Abstract が Zotero に登録されていません。</p>
              )}
            </div>
          )}
          {tab === "pdf" && item.hasPdf && <p className="small muted">PDFを別ウィンドウで表示します。</p>}
        </>
      )}
    </aside>
  );
}

function sanitizeAbstractHtml(input: string): string {
  // Zotero abstract may contain basic HTML tags like <h4>; keep them but strip scripts.
  return input
    .replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "")
    .replace(/\son\w+="[^"]*"/gi, "");
}
