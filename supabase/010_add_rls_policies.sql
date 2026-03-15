-- RLSポリシー追加: 認証ユーザーに全テーブルのCRUDを許可
-- Supabaseはデフォルトで新規テーブルにRLSが有効になるため、
-- ポリシーがないとanon/authenticated keyでアクセスできない

-- clients
ALTER TABLE clients ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated full access on clients"
  ON clients FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- case_studies
ALTER TABLE case_studies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated full access on case_studies"
  ON case_studies FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- target_companies
ALTER TABLE target_companies ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated full access on target_companies"
  ON target_companies FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- contacts
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated full access on contacts"
  ON contacts FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- letters
ALTER TABLE letters ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated full access on letters"
  ON letters FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- reactions
ALTER TABLE reactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated full access on reactions"
  ON reactions FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- knowledge_items
ALTER TABLE knowledge_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow authenticated full access on knowledge_items"
  ON knowledge_items FOR ALL
  USING (auth.role() = 'authenticated')
  WITH CHECK (auth.role() = 'authenticated');

-- NOTE: profiles and audit_logs tables are created in 006_add_approval_and_profiles.sql
-- If that migration has been applied, run the following separately:
--
-- ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
-- CREATE POLICY "Allow authenticated full access on profiles"
--   ON profiles FOR ALL
--   USING (auth.role() = 'authenticated')
--   WITH CHECK (auth.role() = 'authenticated');
--
-- CREATE POLICY "Allow authenticated full access on audit_logs"
--   ON audit_logs FOR ALL
--   USING (auth.role() = 'authenticated')
--   WITH CHECK (auth.role() = 'authenticated');
