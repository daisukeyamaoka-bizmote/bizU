-- target_companies に企業詳細カラムを追加
ALTER TABLE target_companies ADD COLUMN IF NOT EXISTS website TEXT;
ALTER TABLE target_companies ADD COLUMN IF NOT EXISTS phone TEXT;
ALTER TABLE target_companies ADD COLUMN IF NOT EXISTS founded_date TEXT;
ALTER TABLE target_companies ADD COLUMN IF NOT EXISTS fiscal_month TEXT;
ALTER TABLE target_companies ADD COLUMN IF NOT EXISTS representative_email TEXT;
