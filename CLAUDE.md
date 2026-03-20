# bizU - ABM Intelligence SaaS

BtoB向けABMインテリジェンスSaaS。AIを活用したパーソナライズド営業レターの生成・管理プラットフォーム。

## Tech Stack

- **Framework**: Next.js 16 (App Router) + React 19 + TypeScript 5
- **Styling**: Tailwind CSS 4
- **Database**: Supabase (PostgreSQL) with RLS
- **AI**: Anthropic Claude API (`claude-sonnet-4-20250514`)
- **Deployment**: Cloudflare Workers (OpenNextJS)
- **Charts**: Recharts

## Commands

- `npm run dev` — 開発サーバー起動
- `npm run build` — プロダクションビルド
- `npm run lint` — ESLint実行
- `npx tsc --noEmit` — 型チェック
- `npm run deploy` — Cloudflare Workersデプロイ

## Project Structure

```
src/
├── app/
│   ├── (dashboard)/       # メインページ群 (layout.tsxでAppLayout適用)
│   │   ├── page.tsx       # ダッシュボード (分析・KPI・チャート)
│   │   ├── contacts/      # 取引先管理 (インポート含む)
│   │   ├── knowledge/     # ナレッジベース
│   │   ├── projects/      # プロジェクト/キャンペーン管理
│   │   ├── letters/       # 手紙一覧・詳細・レビュー
│   │   ├── reactions/     # 反応記録
│   │   └── settings/      # ユーザー管理
│   ├── auth/login/        # ログイン
│   ├── onboarding/        # 初回セットアップ
│   └── api/               # APIエンドポイント (15個)
├── components/            # 共通コンポーネント (Sidebar, AppLayout等)
├── lib/
│   ├── supabase/          # Supabaseクライアント設定
│   ├── anthropic.ts       # Claude APIラッパー (リトライ付き)
│   ├── constants.ts       # UI選択肢定数
│   └── types/database.ts  # DB型定義
└── middleware.ts           # 認証ミドルウェア
```

## Architecture Notes

- クライアントサイドCRUD: コンポーネントからSupabase直接呼び出し
- AI連携: `/api/generate-letter`, `/api/deep-research`等の専用エンドポイント
- 認証: Supabase Auth + middleware.tsで保護
- マルチテナント: RLSで認証ユーザーベースのアクセス制御
- UIは全て日本語

## Database

スキーマは `supabase/schema.sql` + `supabase/*.sql` (マイグレーション)。
主要テーブル: clients, target_companies, contacts, case_studies, letters, reactions, projects, knowledge_items, profiles, audit_logs

## Coding Conventions

- コンポーネントは `'use client'` でクライアントコンポーネントとして実装
- Supabaseクエリは `createClient()` で直接実行
- スタイリングはTailwind CSSのユーティリティクラス
- アイコンは `@phosphor-icons/react` またはインラインSVG
- エラーメッセージ・UIラベルは日本語
