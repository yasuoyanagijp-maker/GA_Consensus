# Textbook Studio Pipeline

キーワード（章ブリーフ）1つから、**文献収集 → 知見統合 → ファクトチェック → 本文ドラフト → 4枚組BioRender風図表 → Pages用 .docx / .pptx** までを通貫実行するローカルパイプライン。

`consensus.app` + 手動PubMed + `NotebookLM` + `slide+Codia` の各工程を置き換え、既存の [app/editor](../app/editor)（Zotero連携）と `my_clone_for_textbook/style_engine`（教科書スタイル）を再利用する。

## 従来フローとの対応

| 従来の手作業 | 本パイプラインのステージ |
|---|---|
| consensus.app でキーワード検索 | `harvest`（PubMed E-utilities + RAG） |
| 文献を Zotero/NotebookLM に投入 | `zotero`（Zotero書き込みAPI） |
| NotebookLM でサマリー作成 | `synthesize`（LLMバックエンド） |
| （手動の事実確認） | `factcheck`（fact_check_template準拠） |
| textbook エージェントで本文執筆 | `draft`（style_engine プロンプト合成） |
| slide で図表作成 → Codia で PPT 化 | `figures` + `assemble`（python-pptx 4パネル） |
| Pages に統合 | `assemble`（pandoc → .docx、Pages で開く） |

## セットアップ

```bash
# 依存（既存 venv に追加済み）
./venv/bin/python -m pip install -r pipeline/requirements.txt

# 認証情報（Zotero は editor の .env.local を自動フォールバック）
cp pipeline/.env.example pipeline/.env.local
# 必要に応じて RAG / Gemini / NCBI のキーを記入
```

## 使い方

```bash
# コスト見積りのみ
./venv/bin/python -m pipeline.run --brief pipeline/briefs/example_muller_cell.yaml --estimate

# 全工程（既定: LLM=none の dry モード, 図=pptx_placeholder, ともに無料）
./venv/bin/python -m pipeline.run --brief pipeline/briefs/example_muller_cell.yaml

# 部分実行（例: 統合〜本文だけ再生成）
./venv/bin/python -m pipeline.run --brief <brief> --from synthesize --to draft

# バックエンドを一時上書き / Pages を開く / Zotero を飛ばす
./venv/bin/python -m pipeline.run --brief <brief> --llm-provider google_pro --image-provider gemini_imagen --open-pages
./venv/bin/python -m pipeline.run --brief <brief> --no-zotero --no-pptx
```

ステージ: `harvest → zotero → synthesize → factcheck → draft → figures → assemble`

## バックエンド設定（`config/backends.json`）

3系統を独立に切り替える:

- **`retriever`**（RAGリトリーバ = 文献チャンク検索）: `rag_query`（既定）/ `none`
- **`llm`**（本文生成 = NotebookLM代替）: `none`（dry: プロンプトを `*.prompt.txt` に出力し手動でNotebookLM/Google Proに貼る）/ `rag_openai_compat`（別PCのOpenAI互換サーバ）/ `rag_custom_rest`（生成APIを返す独自REST）/ `google_pro`（Gemini）
- **`image`**（4パネル図表）: `pptx_placeholder`（無料・空枠+キャプションのpptx）/ `prompt_only`（無料・英語プロンプト+日本語キャプションのみ）/ `gemini_imagen`（従量・Imagenで描画）

### リトリーバ vs ジェネレータ（重要な区別）

| | 役割 | 出力 | モジュール |
|---|---|---|---|
| **RAGリトリーバ** | Zotero論文 + ローカルPDFの意味検索 | ランク付けされた**チャンク** | `rag_client.RagRetriever`（`retriever` 設定） |
| **LLMジェネレータ** | 文章生成 | 完成した**散文** | `adapters/llm.py`（`llm` 設定） |

リトリーバは**文章を書かない**。検索チャンクを `synthesize` ステージの CONTEXT として前置し、実際の生成は LLM バックエンド（`google_pro` / `rag_openai_compat` / `none`-dry）が担う。両者は併存する。`adapters/llm.py` の `rag_custom_rest` は「生成済みの答え」を返す**ジェネレータ**であり、リトリーバとは別物。

**確定エンドポイント契約**（ユーザーの FastAPI サーバ, port 8503; 稼働中）:

```
POST http://192.168.10.101:8503/query
  body : {"query": "<text>", "limit": 5,
          "year_filter": "2024"?, "source_filter": "zotero"|"chunks"?}
  resp : {"status":"success","results":[
            {"id":"...","title":"...","content":"...","year":"2024",
             "source":"zotero"|"chunk","similarity":0.895}, ...]}
  backend: multilingual-e5-base + pgvector / similarity >= 0.4 / similarity 降順
```

- 設定は `.env.local` の `RAG_QUERY_URL` / `RAG_QUERY_API_KEY` / `RAG_QUERY_LIMIT` / `RAG_MIN_SIMILARITY`。
- **絞り込み**: `config/backends.json` の `retriever.year_filter` / `retriever.source_filter`（グローバル既定）。章ブリーフの `rag_year_filter` / `rag_source_filter` が**毎回これを上書き**する。`None`/空 のときフィルタは送信されない。
- 応答の `id` / `year` は `RetrievedChunk` に保持され、CONTEXT 文字列は `[{source}, {year}] {title} (sim x.xx)` 形式（year があるとき）。
- リトリーバが**到達不能でもパイプラインは停止しない**（警告を出して PubMed 抄録のみで続行）。初回リクエストはモデルウォームアップで 5-10 秒（read=60s タイムアウトで吸収）。

```bash
# リトリーバ疎通確認（ブリーフ不要）
./venv/bin/python -m pipeline.run --check-rag
```

RAGサーバの仕様が確定したら `rag_*` プロバイダに切り替えるだけで自動生成に移行できる（dryモード中は手動運用と完全互換）。

## 成果物（`pipeline/out/<slug>/`）

- `literature.json` … 収集文献（Zotero登録済み）
- `synthesis.md` / `fact_check.md` … 知見サマリー / ファクトチェック（dry時は `*.prompt.txt` も）
- `content/drafts/<date>_<slug>_textbook.md` … 本文ドラフト（`[!FIGURE]`付き、章末Vancouver参考文献）→ app/editor で引用リンク確認
- `figures.json` / `figure_prompts.md` … 図プロンプト・キャプション
- `*_final.md` / `*_final.docx` … 図埋め込み済み最終稿（.docx は Pages で直接オープン可）
- `*_figures.pptx` … 4パネルスライド（slide+Codia の置き換え）
- `publication_check.md` … 公開前チェック（構造的 PASS/FAIL ゲート）

## 品質ゲート

`assemble` 時に `content/assets/publication_checklist.md` の機械的サブセット（参考文献・出典番号・免責・COI・dry残留）を自動判定。医学的妥当性の最終判断は人/LLMレビューに委ねる設計。
