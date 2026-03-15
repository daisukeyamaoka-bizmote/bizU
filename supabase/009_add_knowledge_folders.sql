-- ナレッジフォルダ（インポート単位でナレッジをグループ化）
CREATE TABLE IF NOT EXISTS knowledge_folders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- knowledge_items にフォルダIDを追加
ALTER TABLE knowledge_items ADD COLUMN IF NOT EXISTS folder_id UUID REFERENCES knowledge_folders(id) ON DELETE SET NULL;

-- インデックス
CREATE INDEX IF NOT EXISTS idx_knowledge_folders_client ON knowledge_folders(client_id);
CREATE INDEX IF NOT EXISTS idx_knowledge_items_folder ON knowledge_items(folder_id);
