-- ナレッジDB（クライアント/プロダクトごとの営業知識ベース）
CREATE TABLE IF NOT EXISTS knowledge_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  category TEXT NOT NULL
    CHECK (category IN ('product_info','case_study','sales_material','competitor','market','other')),
  title TEXT NOT NULL,                       -- タイトル（例: harutaka製品概要、西松屋チェーン導入事例）
  content TEXT NOT NULL,                     -- AI抽出したテキストコンテンツ
  source_type TEXT NOT NULL
    CHECK (source_type IN ('url','pdf','file','manual')),
  source_name TEXT,                          -- ファイル名やURL
  case_study_id UUID REFERENCES case_studies(id),  -- ケーススタディと紐づく場合
  tags TEXT[],                               -- 検索用タグ
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- プロジェクト × ナレッジ の中間テーブル
CREATE TABLE IF NOT EXISTS project_knowledge (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID REFERENCES projects(id) ON DELETE CASCADE,
  knowledge_id UUID REFERENCES knowledge_items(id) ON DELETE CASCADE,
  UNIQUE(project_id, knowledge_id)
);

-- インデックス
CREATE INDEX IF NOT EXISTS idx_knowledge_client ON knowledge_items(client_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_category ON knowledge_items(category);
CREATE INDEX IF NOT EXISTS idx_project_knowledge_project ON project_knowledge(project_id);
