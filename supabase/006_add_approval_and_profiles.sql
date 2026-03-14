-- ファクトチェック＆承認機能 + プロフィール + 監査ログ

-- letters テーブルにカラム追加
ALTER TABLE letters ADD COLUMN sources JSONB;            -- ソース情報JSON配列
ALTER TABLE letters ADD COLUMN is_approved BOOLEAN DEFAULT false;
ALTER TABLE letters ADD COLUMN approved_by TEXT;          -- 承認者名（表示名コピー）
ALTER TABLE letters ADD COLUMN approved_by_user_id UUID;  -- 承認者のauth.users ID
ALTER TABLE letters ADD COLUMN approved_at TIMESTAMPTZ;

-- プロフィールテーブル（Supabase auth.usersと紐付け）
CREATE TABLE IF NOT EXISTS profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,                  -- 表示名
  role TEXT DEFAULT 'member'
    CHECK (role IN ('admin', 'member')),
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- 監査ログテーブル
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id),
  user_name TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_id TEXT,
  ip_address TEXT,
  user_agent TEXT,
  result TEXT DEFAULT 'success'
    CHECK (result IN ('success', 'failure')),
  detail JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- 監査ログはINSERTのみ（RLSで保護）
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- インデックス
CREATE INDEX IF NOT EXISTS idx_letters_approved ON letters(is_approved);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
