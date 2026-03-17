-- プロジェクトに手紙レイアウト設定を追加
-- 'recipient_first': 宛先が上、差出人が下（デフォルト）
-- 'sender_first': 差出人が上、宛先が下
ALTER TABLE projects ADD COLUMN IF NOT EXISTS letter_layout TEXT DEFAULT 'recipient_first';

-- 差出人情報（プロジェクト単位でカスタマイズ可能）
ALTER TABLE projects ADD COLUMN IF NOT EXISTS sender_company TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS sender_name TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS sender_title TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS sender_phone TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS sender_email TEXT;
ALTER TABLE projects ADD COLUMN IF NOT EXISTS sender_address TEXT;
