import { useCallback, useRef, useState } from "react";
import {
  api,
  type PipelineArtifacts,
  type PipelineEvent,
  type PipelineRunRequest,
} from "../lib/api";

const STAGE_LABELS: { id: string; label: string }[] = [
  { id: "harvest", label: "文献収集 (PubMed)" },
  { id: "zotero", label: "Zotero登録" },
  { id: "synthesize", label: "知見統合 (RAG/LLM)" },
  { id: "factcheck", label: "ファクトチェック" },
  { id: "draft", label: "本文ドラフト" },
  { id: "figures", label: "図表生成" },
  { id: "assemble", label: "組版 (docx/pptx)" },
];

type StageStatus = "pending" | "start" | "done" | "skipped" | "error";

const STATUS_BADGE: Record<StageStatus, string> = {
  pending: "·",
  start: "実行中…",
  done: "✓",
  skipped: "—",
  error: "✕",
};

type Props = {
  onOpenDraft: (runId: string, absPath: string) => void;
};

export function StudioPanel({ onOpenDraft }: Props) {
  const [keywords, setKeywords] = useState("");
  const [title, setTitle] = useState("");
  const [outline, setOutline] = useState("");
  const [maxResults, setMaxResults] = useState(15);
  const [figures, setFigures] = useState(true);
  const [zotero, setZotero] = useState(false); // default OFF for safety
  const [rag, setRag] = useState(true);
  const [ragYear, setRagYear] = useState("");
  const [ragSource, setRagSource] = useState<"" | "zotero" | "chunks">("");
  const [llmProvider, setLlmProvider] = useState("none");
  const [imageProvider, setImageProvider] = useState("pptx_placeholder");

  const [running, setRunning] = useState(false);
  const [statuses, setStatuses] = useState<Record<string, StageStatus>>({});
  const [details, setDetails] = useState<Record<string, string>>({});
  const [artifacts, setArtifacts] = useState<PipelineArtifacts | null>(null);
  const [gatePassed, setGatePassed] = useState<boolean | null>(null);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const esRef = useRef<EventSource | null>(null);
  const runIdRef = useRef<string>("");

  const resetRunState = () => {
    setStatuses(Object.fromEntries(STAGE_LABELS.map((s) => [s.id, "pending"])) as Record<string, StageStatus>);
    setDetails({});
    setArtifacts(null);
    setGatePassed(null);
    setError("");
    setMessage("");
  };

  const handleEvent = useCallback((ev: PipelineEvent) => {
    if (ev.event === "stage" && ev.stage) {
      setStatuses((prev) => ({ ...prev, [ev.stage as string]: (ev.status ?? "done") as StageStatus }));
      if (ev.detail) setDetails((prev) => ({ ...prev, [ev.stage as string]: ev.detail as string }));
    } else if (ev.event === "done") {
      if (ev.error) {
        setError(ev.error);
      } else {
        setArtifacts(ev.artifacts ?? null);
        setGatePassed(ev.gate_passed ?? null);
        setMessage("完了しました");
      }
    } else if (ev.event === "closed") {
      setRunning(false);
      esRef.current?.close();
      esRef.current = null;
    }
  }, []);

  const start = async () => {
    if (running) return;
    if (!keywords.trim()) {
      setError("キーワードを入力してください");
      return;
    }
    resetRunState();
    setRunning(true);
    const body: PipelineRunRequest = {
      keywords,
      title: title.trim() || undefined,
      outline: outline.trim() || undefined,
      maxResults,
      figures,
      zotero,
      rag,
      ragYear: ragYear.trim() || undefined,
      ragSource: ragSource || undefined,
      llmProvider,
      imageProvider,
    };
    try {
      const { runId } = await api.runPipeline(body);
      runIdRef.current = runId;
      const es = new EventSource(api.pipelineEventsUrl(runId));
      esRef.current = es;
      es.onmessage = (e) => {
        try {
          handleEvent(JSON.parse(e.data) as PipelineEvent);
        } catch {
          /* ignore */
        }
      };
      es.onerror = () => {
        // Stream ends (server closes on completion) -> stop the spinner.
        setRunning(false);
        es.close();
        esRef.current = null;
      };
    } catch (e) {
      setError(String(e));
      setRunning(false);
    }
  };

  const draftFileName = artifacts?.draft ? artifacts.draft.split("/").pop() ?? "" : "";
  const runId = runIdRef.current;
  const artifactLink = (label: string, absPath?: string | null, download = false) =>
    absPath ? (
      <a
        className="studio-artifact"
        href={api.pipelineArtifactUrl(runId, absPath, download)}
        target="_blank"
        rel="noreferrer"
      >
        {label}
      </a>
    ) : null;

  return (
    <div className="studio">
      <div className="studio__form">
        <h2>Textbook Studio</h2>
        <p className="muted small">
          ワードを入力してパイプライン (文献収集→統合→本文→図表→組版) を実行します。
        </p>

        <label className="studio__label">キーワード / ワード（カンマ・改行で複数可）*</label>
        <textarea
          className="studio__textarea"
          rows={3}
          placeholder="Muller cell cone retinal disease, Muller glia macular hole"
          value={keywords}
          onChange={(e) => setKeywords(e.target.value)}
          disabled={running}
        />

        <label className="studio__label">章タイトル（任意）</label>
        <input
          className="studio__input"
          placeholder="Muller細胞と網膜疾患"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          disabled={running}
        />

        <label className="studio__label">想定見出し（任意・1行1見出し）</label>
        <textarea
          className="studio__textarea"
          rows={3}
          placeholder={"発生学的起源\n病態\n画像所見"}
          value={outline}
          onChange={(e) => setOutline(e.target.value)}
          disabled={running}
        />

        <div className="studio__row">
          <label className="studio__check">
            <input type="checkbox" checked={figures} onChange={(e) => setFigures(e.target.checked)} disabled={running} />
            図表を作成する
          </label>
          <label className="studio__check">
            <input type="checkbox" checked={zotero} onChange={(e) => setZotero(e.target.checked)} disabled={running} />
            Zoteroに登録する
          </label>
          <label className="studio__check">
            <input type="checkbox" checked={rag} onChange={(e) => setRag(e.target.checked)} disabled={running} />
            ローカルRAGを使う
          </label>
        </div>
        {zotero && <p className="studio__hint">⚠️ 実際のZoteroライブラリに書き込みます（既定はOFF）。</p>}

        {rag && (
          <div className="studio__row">
            <label className="studio__field">
              年フィルタ
              <input
                className="studio__input"
                placeholder="2024"
                value={ragYear}
                onChange={(e) => setRagYear(e.target.value)}
                disabled={running}
              />
            </label>
            <label className="studio__field">
              ソース
              <select value={ragSource} onChange={(e) => setRagSource(e.target.value as typeof ragSource)} disabled={running}>
                <option value="">両方</option>
                <option value="zotero">zotero</option>
                <option value="chunks">chunks (ローカルPDF)</option>
              </select>
            </label>
          </div>
        )}

        <div className="studio__row">
          <label className="studio__field">
            LLMプロバイダ
            <select value={llmProvider} onChange={(e) => setLlmProvider(e.target.value)} disabled={running}>
              <option value="none">none（手動/ドライ）</option>
              <option value="google_pro">google_pro</option>
              <option value="rag_openai_compat">rag_openai_compat</option>
              <option value="rag_custom_rest">rag_custom_rest</option>
            </select>
          </label>
          <label className="studio__field">
            図エンジン
            <select value={imageProvider} onChange={(e) => setImageProvider(e.target.value)} disabled={running || !figures}>
              <option value="pptx_placeholder">pptx_placeholder</option>
              <option value="prompt_only">prompt_only</option>
              <option value="gemini_imagen">gemini_imagen</option>
            </select>
          </label>
          <label className="studio__field">
            取得件数
            <input
              type="number"
              className="studio__input"
              min={1}
              max={100}
              value={maxResults}
              onChange={(e) => setMaxResults(Number(e.target.value) || 1)}
              disabled={running}
            />
          </label>
        </div>

        <button type="button" className="btn primary studio__run" onClick={start} disabled={running}>
          {running ? "実行中…" : "実行"}
        </button>
        {error && <p className="error small">{error}</p>}
        {message && <p className="search-ok small">{message}</p>}
      </div>

      <div className="studio__progress">
        <h3>進捗</h3>
        <ul className="studio__stages">
          {STAGE_LABELS.map((s) => {
            const st = statuses[s.id] ?? "pending";
            return (
              <li key={s.id} className={`studio__stage studio__stage--${st}`}>
                <span className="studio__stage-badge">{STATUS_BADGE[st]}</span>
                <span className="studio__stage-label">{s.label}</span>
                {details[s.id] && <span className="studio__stage-detail muted small">{details[s.id]}</span>}
              </li>
            );
          })}
        </ul>

        {gatePassed !== null && (
          <p className={gatePassed ? "search-ok" : "error"}>
            公開前チェック: {gatePassed ? "✅ PASS" : "❌ 要修正（dryモードでは想定どおり）"}
          </p>
        )}

        {artifacts && (
          <div className="studio__artifacts">
            <h3>成果物</h3>
            <div className="studio__artifact-links">
              {artifactLink("ドラフト .md", artifacts.draft)}
              {artifactLink("最終 .md", artifacts.finalMd)}
              {artifactLink(".docx (Pages)", artifacts.docx, true)}
              {artifactLink(".pptx (スライド)", artifacts.pptx, true)}
              {artifactLink("文献 JSON", artifacts.literature)}
              {artifactLink("公開前チェック", artifacts.gateReport)}
            </div>
            {draftFileName && artifacts.draft && (
              <button
                type="button"
                className="btn studio__open-editor"
                onClick={() => onOpenDraft(runId, artifacts.draft as string)}
              >
                エディタでドラフトを開く（プレビュー）
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
