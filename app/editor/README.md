# GA Consensus Editor

`content/drafts/ga_consensus/` 内の `ga_*.md` を、**プレビューしながら編集**し、**Zotero** の文献（Abstract / PDF）を参照するローカル用エディタです。

## 機能

- 章ファイルの一覧・読み込み・保存（Markdown のまま）
- 左：編集 / 右：リアルタイムプレビュー
- 参考文献 `[n]` を Zotero 項目にリンク（`.zotero-citation-map.json` に保存）
- プレビュー内の `[n]` クリック → Abstract / PDF 表示
- 「要件マップ」タブで、CSV課題と `ga_*.md` 9章対応・章ごとの想定コンセンサスステートメントを確認

## セットアップ

```bash
cd app/editor
cp .env.example .env.local
# .env.local に ZOTERO_USER_ID と ZOTERO_API_KEY を記入
npm install
npm run dev
```

ブラウザ: http://localhost:5173（API は http://localhost:3847）

停止: ターミナルで `Ctrl+C`

## 本番ビルド（単一サーバー）

```bash
npm run build
NODE_ENV=production npm start
```

http://localhost:3847 で UI + API

## GitHub Pages で公開（フロントのみ）

このアプリは通常 `Express API` を使うため、GitHub Pages では **フロントエンドのみ** を配信し、API は別ホスト（Render / Railway / Fly.io など）に置く構成になります。  
また、公開版では `VITE_READ_ONLY=1` を有効にしているため、**編集UIは非表示（閲覧専用）** です。

1. リポジトリに同梱済みの workflow `/.github/workflows/deploy-ga-editor-pages.yml` を使用する  
2. GitHub の `Settings > Secrets and variables > Actions` で `VITE_API_BASE_URL` を登録（例: `https://your-api.example.com`）  
3. `main` ブランチに push すると Pages が自動デプロイされる  
4. `Settings > Pages` の Source を **GitHub Actions** にする  

公開 URL は次の形式です。  
`https://<your-user>.github.io/<your-repository>/`

## セキュリティ

- **Zotero API キーは `.env.local` のみ**（git に含めない）
- キーはサーバー側プロキシ経由でのみ使用（フロントに露出しない）
- チャット等でキーを共有した場合は [Zotero 設定](https://www.zotero.org/settings/keys) から再発行を推奨

---

## 操作方法

### 1. 原稿の編集と保存

1. 画面上部のドロップダウンで章（`ga_*.md`）を選択する
2. **左ペイン**で Markdown を編集する（ツールバーで見出し・太字なども可）
3. **右ペイン**でプレビューを確認する（保存前でもリアルタイム反映）
4. 変更後は **「保存 *」** を押す（`*` は未保存の印）

### 2. 文献リンク（Zotero）— 検索・紐づけ

右ペイン上部の **「文献リンク」** タブを開く。

> 起動時に、全 `ga_*.md` の未リンク文献は自動で Zotero 検索・紐付けが実行される（結果は上部ステータスに表示）。

文献リンクパネル上部に **「未解決のみ表示」** トグルがあり、手動補完時は未リンク文献だけを一覧できる。
さらに **「未解決候補を更新」** で検索条件を緩めた候補文献を生成し、候補からクリック選択で紐付けできる（候補はJSON保存され再起動後も保持）。

| 手順 | 操作 |
|------|------|
| 1 | リンクしたい参考文献の **「Zotero で検索・リンク」** をクリック |
| 2 | 自動で Zotero 検索が始まる（**プログレスバー**と「Zotero を検索しています…」が表示） |
| 3 | 検索語は参考文献の **論文タイトル** から自動入力される（下の入力欄で編集可） |
| 4 | 候補リストが **自動表示** される（件数と検索語をステータス行に表示） |
| 5 | 正しい文献の行をクリック → その `[n]` と Zotero が紐づく |
| 6 | 紐づけ時に該当 `.md` の参考文献 `[n]` を **Vancouver形式** で自動更新 |
| 7 | 紐づけ後は **「Zotero で開く」** で Abstract / PDF を確認できる |

**ヒットが0件のとき**

- 別キーワードでの **再検索** が自動で1回走る
- それでも0件なら、検索キーワード欄を短くする（例: 著者姓 + キーワード2〜3語）して **「再検索」** を押す

**すでにリンク済みの文献**

- **「Zotero で開く」** … 右ペインの「Zotero」タブに切り替えて表示
- **「解除」** … リンクだけ外す（Zotero ライブラリ自体は変更しない）

### 3. プレビューから文献を開く

1. 文献をリンク済みにしておく
2. **右ペイン（プレビュー）** の本文中の `[1]` など（リンク済みは色付き）をクリック
3. **「Zotero」** タブで **Abstract** または **PDF**（添付がある場合）を表示

リンク未設定の `[n]` をクリックした場合は、「文献リンク」タブに移動して紐づけを促します。

### 4. 保存されるデータ

| ファイル | 内容 |
|----------|------|
| `content/drafts/ga_consensus/*.md` | 原稿本文（「保存」で上書き） |
| `content/drafts/ga_consensus/.zotero-citation-map.json` | 章ごとの `[番号]` → Zotero 項目キー |
| `content/drafts/ga_consensus/.zotero-unresolved-candidates.json` | 未解決文献ごとの候補一覧（緩い検索結果） |

---

## トラブルシュート

- **文献が0件のまま** … 検索語が著者名だけになっていないか確認。タイトルの一部を入力して「再検索」
- **API エラー** … `npm run dev` で server と client の両方が起動しているか、`.env.local` の Zotero ID/キーを確認
- **章が読めない** … `GA_CONSENSUS_DIR` が `../../content/drafts/ga_consensus`（`app/editor` からの相対パス）になっているか確認
