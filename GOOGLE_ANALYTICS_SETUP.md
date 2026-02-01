# Google Analytics 4 設定ガイド

## 📊 実装済みの機能

このサイトにはGoogle Analytics 4 (GA4) のトラッキングコードが実装されています。
Google Analytics測定IDを設定するだけで、すぐにアクセス解析が開始されます。

---

## 🚀 設定手順

### 1. Google Analyticsアカウントの作成

1. [Google Analytics](https://analytics.google.com/) にアクセス
2. 「測定を開始」をクリック
3. アカウント名を入力（例: Akagami Prompt）
4. プロパティ名を入力（例: Akagami Prompt Website）
5. 業種、ビジネス規模、利用目的を選択
6. 「ウェブ」を選択
7. ウェブサイトURL: `https://akagami-prompt.pages.dev`
8. ストリーム名: `Akagami Prompt`

### 2. 測定IDの取得

設定完了後、画面に表示される**測定ID**をコピーします。
- 形式: `G-XXXXXXXXXX`（例: `G-ABC123DEF4`）

### 3. コードの更新

`src/index.tsx` ファイル内の以下の箇所を修正します：

#### 修正箇所（3箇所あります）

**トップページ（352行目あたり）:**
```typescript
<!-- Google Analytics 4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX', {  // ← ここを変更
```

**プロンプト詳細ページ（700行目あたり）:**
```typescript
<!-- Google Analytics 4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX', {  // ← ここを変更
```

**管理画面（1400行目あたり）:**
```typescript
<!-- Google Analytics 4 -->
<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>
<script>
  window.dataLayer = window.dataLayer || [];
  function gtag(){dataLayer.push(arguments);}
  gtag('js', new Date());
  gtag('config', 'G-XXXXXXXXXX', {  // ← ここを変更
```

**一括置換コマンド（推奨）:**
```bash
cd /home/user/webapp
sed -i 's/G-XXXXXXXXXX/G-YOUR-ACTUAL-ID/g' src/index.tsx
```

### 4. デプロイ

```bash
cd /home/user/webapp
npm run build
npx wrangler pages deploy dist --project-name akagami-prompt
```

---

## 📈 計測されるデータ

### 基本的なページビュー
- トップページ
- プロンプト詳細ページ
- 管理画面

### カスタムイベント

#### 1. **copy_prompt** - トップページでのコピー
- イベントカテゴリ: `engagement`
- イベントラベル: プロンプトのタイトル
- 値: プロンプトID

#### 2. **copy_prompt_detail** - 詳細ページでのコピー
- イベントカテゴリ: `engagement`
- イベントラベル: プロンプトのタイトル
- 値: プロンプトID

#### 3. **submit_feedback** - 感想投稿
- イベントカテゴリ: `engagement`
- イベントラベル: プロンプトのタイトル
- 値: プロンプトID

#### 4. **filter_category** - カテゴリフィルター
- イベントカテゴリ: `navigation`
- イベントラベル: カテゴリ名（例: ビジネス、アイコン写真）

#### 5. **open_lightbox** - 画像拡大表示
- イベントカテゴリ: `engagement`
- イベントラベル: プロンプトのタイトル
- 値: 画像インデックス

---

## 🔍 分析できること

### ユーザー行動
- どのプロンプトがよく見られているか
- どのプロンプトがよくコピーされているか
- どのカテゴリが人気か
- 画像をどれくらい拡大して見ているか
- 感想投稿の頻度

### アクセス情報
- リアルタイムユーザー数
- 日別・週別・月別のアクセス数
- 流入元（検索、SNS、直接アクセス）
- デバイス（PC、スマホ、タブレット）
- 地域
- ページ滞在時間
- 直帰率

---

## 📊 Google Analyticsで確認する方法

### 1. リアルタイム確認
1. Google Analytics ダッシュボード
2. 左メニュー「リアルタイム」
3. 現在のアクセス状況を確認

### 2. イベントレポート
1. 左メニュー「エンゲージメント」→「イベント」
2. カスタムイベント（copy_prompt、submit_feedbackなど）を確認

### 3. ページビュー
1. 左メニュー「エンゲージメント」→「ページとスクリーン」
2. 人気ページのランキングを確認

### 4. ユーザー属性
1. 左メニュー「ユーザー」→「ユーザー属性」
2. 年齢、性別、地域などを確認

---

## 🎯 活用例

### プロンプトの人気度分析
- `copy_prompt` イベントで最もコピーされるプロンプトを特定
- 人気プロンプトを参考に新しいプロンプトを作成

### カテゴリ最適化
- `filter_category` イベントでよく見られるカテゴリを確認
- 人気カテゴリのプロンプトを増やす

### ユーザーエンゲージメント
- `submit_feedback` イベントで感想投稿の頻度を確認
- 感想を書きやすい仕組みを検討

### コンバージョン設定
1. Google Analytics で「イベント」→「コンバージョンとしてマーク」
2. `copy_prompt` や `submit_feedback` をコンバージョンに設定
3. 目標達成率を追跡

---

## 🔒 プライバシー対応

実装済みの設定:
- IPアドレスの匿名化
- cookieの使用同意（GA4はデフォルトでGDPR準拠）
- ユーザープライバシーを尊重した計測

必要に応じて、プライバシーポリシーページに以下を追加することをおすすめします:
> 当サイトではGoogle Analyticsを使用してアクセス解析を行っています。データは匿名で収集され、個人を特定するものではありません。

---

## 🆘 トラブルシューティング

### データが表示されない
1. 測定IDが正しく設定されているか確認
2. デプロイ後24時間待つ（データ反映に時間がかかる場合があります）
3. ブラウザの拡張機能（広告ブロッカー）を無効化してテスト

### リアルタイムで確認
1. サイトにアクセスしながらGoogle Analyticsの「リアルタイム」を開く
2. 自分のアクセスが反映されるか確認

### イベントが計測されない
1. ブラウザのコンソールでエラーがないか確認
2. `gtag` が定義されているか確認（開発者ツールのコンソールで `typeof gtag` を実行）

---

**作成日**: 2026-02-01
**対象サイト**: Akagami Prompt
**URL**: https://akagami-prompt.pages.dev/
