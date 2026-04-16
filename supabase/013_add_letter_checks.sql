-- Migration 013: letter_checks テーブル追加
-- 自動ダブルチェック + 人間のチェック履歴を保存するテーブル

CREATE TABLE IF NOT EXISTS letter_checks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  letter_id UUID NOT NULL REFERENCES letters(id) ON DELETE CASCADE,
  -- チェック種別
  check_type TEXT NOT NULL CHECK (check_type IN ('fact', 'tone', 'typo', 'why_you', 'overall')),
  -- 判定結果
  status TEXT NOT NULL CHECK (status IN ('pass', 'caution', 'fail')),
  -- 0-100のスコア (overall時のみ)
  score INT,
  -- チェック結果の詳細 (findings, suggestion等)
  findings JSONB,
  -- 要約 (UI一覧表示用)
  summary TEXT,
  -- 改善提案
  suggestion TEXT,
  -- 実行者: 'ai' または user_id (UUID文字列)
  performed_by TEXT NOT NULL,
  performed_by_name TEXT,
  -- 実行日時
  performed_at TIMESTAMPTZ DEFAULT now(),
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_letter_checks_letter ON letter_checks(letter_id);
CREATE INDEX IF NOT EXISTS idx_letter_checks_performed_at ON letter_checks(performed_at DESC);
CREATE INDEX IF NOT EXISTS idx_letter_checks_status ON letter_checks(status);
CREATE INDEX IF NOT EXISTS idx_letter_checks_type ON letter_checks(check_type);

-- RLS有効化
ALTER TABLE letter_checks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Allow authenticated full access on letter_checks" ON letter_checks;
CREATE POLICY "Allow authenticated full access on letter_checks"
  ON letter_checks FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);
