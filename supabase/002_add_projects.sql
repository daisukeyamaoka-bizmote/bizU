-- プロジェクト（キャンペーン）テーブル
-- 「ZENKIGENの3月施策」のような単位で対象リスト・文面・送付状況を管理
CREATE TABLE IF NOT EXISTS projects (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  name TEXT NOT NULL,                        -- プロジェクト名（例: 2026年3月 製造業向け施策）
  description TEXT,                          -- 説明
  why_you_angle TEXT,                        -- デフォルトのWhy You切り口
  send_trigger TEXT,                         -- デフォルトの送付トリガー
  case_study_id UUID REFERENCES case_studies(id),  -- デフォルトのケーススタディ
  letter_template TEXT,                      -- 文面テンプレート（AIへの追加指示）
  status TEXT DEFAULT 'draft'
    CHECK (status IN ('draft','active','completed','archived')),
  target_count INT DEFAULT 0,                -- 対象者数
  sent_count INT DEFAULT 0,                  -- 送付済数
  reacted_count INT DEFAULT 0,               -- 反応数
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- プロジェクト × コンタクト の中間テーブル（対象リスト管理）
CREATE TABLE IF NOT EXISTS project_contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  contact_id UUID REFERENCES contacts(id),
  status TEXT DEFAULT 'pending'
    CHECK (status IN ('pending','generated','sent','reacted','skipped')),
  letter_id UUID REFERENCES letters(id),     -- 生成された手紙
  assigned_at TIMESTAMPTZ DEFAULT now(),
  sent_at DATE,
  UNIQUE(project_id, contact_id)
);

-- letters テーブルに project_id を追加
ALTER TABLE letters ADD COLUMN IF NOT EXISTS project_id UUID REFERENCES projects(id);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_projects_client ON projects(client_id);
CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status);
CREATE INDEX IF NOT EXISTS idx_project_contacts_project ON project_contacts(project_id);
CREATE INDEX IF NOT EXISTS idx_project_contacts_status ON project_contacts(status);
CREATE INDEX IF NOT EXISTS idx_letters_project ON letters(project_id);
