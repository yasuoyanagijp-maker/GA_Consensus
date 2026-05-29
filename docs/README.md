# 新しいテーマで記事を生成する方法

## 概要

キーワード（テーマ）を1つ与えるだけで、以下を端から端まで自動生成するローカルパイプライン（Textbook Studio）です。

```
文献収集 (PubMed) → RAG文脈 → 知見統合 → ファクトチェック → 本文ドラフト → （任意で図表） → .docx / .pptx
```

- **図表なしのテキスト記事**が既定で生成可能です（`--no-figures`）。
- 図表を付ける場合も、既定では画像を生成せず、スライド枠＋凡例（プレースホルダ）だけを作るので無料・安全です。
- 本文は日本語で生成され、医学的主張に `[n]` 出典番号と章末 Vancouver 参考文献が付きます。

## 前提

| 必要なもの | 用途 |
|---|---|
| repo の venv (`./venv`) | Python 実行環境 |
| `pandoc` | 最終 `.docx` 書き出し（未導入だと docx はスキップ） |
| `pipeline/.env.local` | `GEMINI_API_KEY`（本文生成）、Zotero 認証、`RAG_QUERY_URL` |

- 現在の生成モデルは `GEMINI_MODEL=gemini-2.5-flash`（`pipeline/.env.local` に設定）。
- `pipeline/.env.local` と `pipeline/out/` は gitignore 済みでコミットされません。

## 方法A（CLI・新しいテーマをその場で指定）

テキストのみの記事（図表なし）を最安構成で作る例:

```bash
./venv/bin/python -m pipeline.run \
  --title "テーマ名" \
  --keyword "kw1" --keyword "kw2" \
  --no-figures --no-zotero \
  --llm-provider google_pro
```

- `--keyword` は繰り返し指定できます（`--keywords "kw1;kw2;kw3"` で一括指定も可）。
- `--no-figures` = テキストのみ。`--no-zotero` = 実 Zotero ライブラリに書き込まない（安全）。
- `--llm-provider none` にすると Gemini を呼ばず、各ステージのプロンプトを `*.prompt.txt` に書き出す「ドライ実行」になります。

### ブリーフテンプレを使う場合

章構成を固定したいときは、`content/templates/` のブリーフテンプレ（例: `textbook_brief_template.yaml`）をコピーして編集し、`--brief` で渡します。

```bash
cp content/templates/textbook_brief_template.yaml pipeline/briefs/my_topic.yaml
# my_topic.yaml を編集（title / keywords / outline など）
./venv/bin/python -m pipeline.run --brief pipeline/briefs/my_topic.yaml --no-zotero --llm-provider google_pro
```

## 方法B（GUI）

```bash
cd app/editor
npm install   # 初回のみ
npm run dev
```

ブラウザで **Textbook Studio** タブを開き、ワードを入力 → トグル（図表 OFF など）を設定 → **実行**。
進捗（harvest→synthesize→…→assemble）がライブ表示され、完了後に成果物のダウンロード／プレビューリンクが出ます。

## 出力先

| 種別 | パス |
|---|---|
| 本文ドラフト | `content/drafts/<日付>_<slug>_textbook.md` |
| 各ステージ成果物 | `pipeline/out/<slug>/` |

`pipeline/out/<slug>/` の中身:

- `synthesis.md` … 知見サマリー（`[PMID:...]` 付き）
- `fact_check.md` … ファクトチェック表
- `draft.md` … 本文ドラフトの控え
- `*_final.md` … 図埋め込み＋免責フッター付き最終稿
- `*_final.docx` … Pages で直接開ける書き出し
- `*.pptx` … 4パネル図表スライド（図表ありの場合）
- `publication_check.md` … 公開前チェック（PASS/FAIL ゲート）

## 図表を作る場合の補足

- 既定は `--image-provider pptx_placeholder`（画像なし・スライド枠と凡例のみ。無料）。
- 実画像を生成したい場合は `--image-provider gemini_imagen`（**有料** / Google AI Pro）。
- 図表ありで実行すると、本文の `[!FIGURE]` ブロックから英語の生成プロンプトと日本語キャプションが作られ、`figure_prompts.md` に出力されます。

## RAG（ローカル文脈検索）について

- `RAG_QUERY_URL`（既定 `http://192.168.10.101:8503/query`）が応答すれば、Zotero 論文＋ローカル PDF のチャンクを文脈として統合に使います。
- RAG が落ちている場合は **自動で PubMed 抄録のみにフォールバック**します（パイプラインは止まりません）。
- 疎通確認:

```bash
./venv/bin/python -m pipeline.run --check-rag
```

## ディレクトリ構成（抜粋）

```
pipeline/            パイプライン本体（CLI: python -m pipeline.run）
app/editor/          ローカル編集 GUI（Textbook Studio タブを含む）
content/drafts/      生成された本文ドラフト
content/published/   公開済み記事
content/assets/      図版・公開前チェックリスト等
content/templates/   ブリーフ／原稿テンプレ
docs/                このドキュメント
```
