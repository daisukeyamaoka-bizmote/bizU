-- セキュリティ修正: 全テーブルのRLS有効化 + 不足ポリシー追加 + ビュー修正
-- Supabase Database Linterで指摘された全ERRORに対応

-- ============================================================
-- Step 1: 全テーブルのRLS有効化（冪等 - 既に有効でもエラーにならない）
-- ============================================================
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE letters ENABLE ROW LEVEL SECURITY;
ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE target_companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE project_knowledge ENABLE ROW LEVEL SECURITY;
ALTER TABLE import_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE knowledge_folders ENABLE ROW LEVEL SECURITY;

-- ============================================================
-- Step 2: 不足テーブルのRLSポリシー追加
-- ============================================================

-- projects
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'projects' AND policyname = 'Allow authenticated full access on projects'
  ) THEN
    CREATE POLICY "Allow authenticated full access on projects"
      ON projects FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- project_contacts
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'project_contacts' AND policyname = 'Allow authenticated full access on project_contacts'
  ) THEN
    CREATE POLICY "Allow authenticated full access on project_contacts"
      ON project_contacts FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- project_knowledge
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'project_knowledge' AND policyname = 'Allow authenticated full access on project_knowledge'
  ) THEN
    CREATE POLICY "Allow authenticated full access on project_knowledge"
      ON project_knowledge FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- import_logs
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'import_logs' AND policyname = 'Allow authenticated full access on import_logs'
  ) THEN
    CREATE POLICY "Allow authenticated full access on import_logs"
      ON import_logs FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- knowledge_folders
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies WHERE tablename = 'knowledge_folders' AND policyname = 'Allow authenticated full access on knowledge_folders'
  ) THEN
    CREATE POLICY "Allow authenticated full access on knowledge_folders"
      ON knowledge_folders FOR ALL
      USING (auth.role() = 'authenticated')
      WITH CHECK (auth.role() = 'authenticated');
  END IF;
END $$;

-- ============================================================
-- Step 3: letter_analytics ビューを SECURITY INVOKER に変更
-- SECURITY INVOKER = クエリ実行ユーザーのRLSポリシーが適用される
-- ============================================================
CREATE OR REPLACE VIEW letter_analytics
WITH (security_invoker = true)
AS
SELECT
  l.id AS letter_id,
  c.name AS client_name,
  tc.industry,
  tc.employee_scale,
  ct.role_level,
  ct.function_tag,
  l.why_you_angle,
  l.send_trigger,
  cs.company_name AS case_study_company,
  cs.challenge_tags,
  l.sent_at,
  l.contact_sequence,
  r.reaction_type,
  r.days_to_react,
  r.reacted_at
FROM letters l
LEFT JOIN clients c ON l.client_id = c.id
LEFT JOIN contacts ct ON l.contact_id = ct.id
LEFT JOIN target_companies tc ON ct.company_id = tc.id
LEFT JOIN case_studies cs ON l.case_study_id = cs.id
LEFT JOIN reactions r ON r.letter_id = l.id;
