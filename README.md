# Akagami Prompt

画像生成プロンプトを管理・共有するWebアプリケーション

## 🌐 本番URL

- **メインサイト**: https://akagami-prompt.pages.dev/
- **管理画面**: https://akagami-prompt.pages.dev/admin

## 📋 プロジェクト概要

**Akagami Prompt**は、画像生成AIのプロンプトを管理・共有するためのWebアプリケーションです。

### 主な機能

#### ユーザー向け機能
- ✅ プロンプト一覧表示（縦長4:5比率の画像グリッド）
- ✅ カテゴリフィルター（ビジネス、アイコン写真、ネタ、その他）
- ✅ プロンプトテキストのワンクリックコピー
- ✅ プロンプト詳細ページ（画像5枚表示）
- ✅ 感想投稿機能（名前必須、コメント・画像は任意）
- ✅ レスポンシブデザイン（PC/タブレット/スマホ対応）

#### 管理者向け機能
- ✅ プロンプトの追加・編集・削除
- ✅ 画像アップロード機能（自動圧縮対応）
  - サムネイル画像: 1枚（一覧表示用）
  - 詳細ページ画像: 4枚（サムネイルが自動的に1枚目になる）
- ✅ カテゴリ管理（追加・編集・削除）
- ✅ クライアント側での画像圧縮（アップロード高速化）

## 🛠️ 技術スタック

### フロントエンド
- **HTML/CSS/JavaScript**: シンプルなUI
- **Tailwind CSS**: CDN経由でスタイリング
- **Font Awesome**: アイコン
- **Axios**: HTTP通信

### バックエンド
- **Hono**: 軽量Webフレームワーク
- **Cloudflare Workers**: エッジコンピューティング
- **Cloudflare Pages**: 静的サイトホスティング

### データベース・ストレージ
- **Cloudflare D1**: SQLiteベースのグローバル分散データベース
- **Cloudflare R2**: S3互換オブジェクトストレージ（画像保存）※要有効化

### デザイン
- **ベースカラー**: 白
- **アクセントカラー**: #E75556（赤系）
- **レイアウト**: シンプル・ミニマル

## 📊 データベース構造

### テーブル

#### `categories`
- カテゴリ管理

#### `prompts`
- プロンプト本体
- タイトル、プロンプトテキスト、サムネイル画像URL、カテゴリID

#### `prompt_images`
- プロンプトに紐づく追加画像（最大4枚）

#### `feedbacks`
- ユーザーからの感想
- 投稿者名（必須）、コメント（任意）、画像（任意）

## 🚀 ローカル開発環境

### 必要なツール
- Node.js 18以降
- npm
- Wrangler CLI

### セットアップ

```bash
# 依存関係のインストール
npm install

# ローカルD1データベースのマイグレーション
npm run db:migrate:local

# サンプルデータの投入
npm run db:seed

# ビルド
npm run build

# PM2で開発サーバー起動
pm2 start ecosystem.config.cjs

# ローカルURL
http://localhost:3000
```

### 便利なコマンド

```bash
# ビルド
npm run build

# ローカルD1データベース操作
npm run db:migrate:local    # マイグレーション適用
npm run db:seed             # サンプルデータ投入
npm run db:reset            # データベースリセット
npm run db:console:local    # ローカルDBコンソール

# 本番D1データベース操作
npm run db:migrate:prod     # マイグレーション適用
npm run db:console:prod     # 本番DBコンソール
```

## 📦 デプロイ

### Cloudflare Pagesへのデプロイ

```bash
# ビルド
npm run build

# デプロイ
npx wrangler pages deploy dist --project-name akagami-prompt
```

### 本番環境設定

#### D1データベース
- **プロジェクト名**: `akagami-prompt-production`
- **Database ID**: `9c0b7f52-3da0-4987-9f7d-747790424db5`

#### R2バケット（オプション）
- 画像アップロード機能を使用する場合、CloudflareダッシュボードでR2を有効化
- バケット名: `akagami-prompt-images`
- 無料プラン: 月10GB

## 🔧 プロジェクト構造

```
webapp/
├── src/
│   └── index.tsx           # Honoアプリケーション（全ルート含む）
├── public/                 # 静的ファイル（現在未使用）
├── migrations/             # D1データベースマイグレーション
│   ├── 0001_initial_schema.sql
│   └── 0002_add_prompt_images.sql
├── sample_data.sql         # サンプルデータ
├── ecosystem.config.cjs    # PM2設定
├── wrangler.jsonc          # Cloudflare設定
├── package.json
├── tsconfig.json
└── README.md
```

## 🎨 デザインガイドライン

### カラーパレット
- **背景**: 白 (`#FFFFFF`)
- **アクセント**: 赤 (`#E75556`)
- **テキスト**: グレー系 (`#374151`, `#6B7280`, `#9CA3AF`)

### レイアウト
- **トップページ**: 最大5列グリッド（レスポンシブ対応）
- **詳細ページ**: 画像5列グリッド（サムネイル+追加画像4枚）
- **画像比率**: 4:5（縦長）

## 🐛 トラブルシューティング

### コピーボタンが動作しない
- ✅ 修正済み: イベント委譲とClipboard APIフォールバックを実装

### 画像が表示されない
- R2バケットが有効化されているか確認
- 画像URLが正しいか確認
- 外部URL（Unsplashなど）を使用することも可能

### データベースが空
```bash
# 本番データベースにサンプルデータを投入
npx wrangler d1 execute akagami-prompt-production --remote --file=./sample_data.sql
```

## 📝 今後の予定

### 完了済み
- ✅ 基本機能実装
- ✅ コピーボタンの完全修正
- ✅ 画像圧縮機能
- ✅ 本番デプロイ

### 未実装（オプション）
- ⏳ R2画像アップロード（要R2有効化）
- ⏳ カスタムドメイン設定
- ⏳ ユーザー認証
- ⏳ プロンプトのいいね機能
- ⏳ 検索機能

## 👨‍💻 開発者情報

- **プロジェクト名**: Akagami Prompt
- **開発開始**: 2026-01-31
- **デプロイ日**: 2026-02-01
- **フレームワーク**: Hono + Cloudflare Workers/Pages
- **データベース**: Cloudflare D1 (SQLite)

## 📄 ライセンス

Private Project

---

**作成者**: Akagami  
**最終更新**: 2026-02-01
