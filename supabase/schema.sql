-- bizU Database Schema
-- ABM Intelligence SaaS MVP

-- テーブル①: clients（クライアント）
CREATE TABLE clients (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  product_name TEXT,
  target_roles TEXT[],
  status TEXT DEFAULT 'active'
    CHECK (status IN ('active','inactive','prospect')),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- テーブル②: case_studies（ケーススタディ）
CREATE TABLE case_studies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  company_name TEXT NOT NULL,
  industry TEXT NOT NULL,
  challenge_tags TEXT[] NOT NULL,
  result_summary TEXT NOT NULL,
  recommended_roles TEXT[],
  recommended_industries TEXT[],
  availability TEXT DEFAULT 'public'
    CHECK (availability IN ('public','restricted','unavailable')),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- テーブル③: target_companies（ターゲット企業）
CREATE TABLE target_companies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  industry TEXT NOT NULL,
  employee_scale TEXT,
  revenue_scale TEXT,
  listing_type TEXT,
  prefecture TEXT,
  recent_topics TEXT,
  topics_updated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- テーブル④: contacts（コンタクト）
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id UUID REFERENCES target_companies(id),
  full_name TEXT NOT NULL,
  department TEXT,
  title TEXT,
  role_level TEXT NOT NULL,
  function_tag TEXT,
  postal_code TEXT,
  address TEXT,
  info_source TEXT,
  info_acquired_at DATE,
  is_verified BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(company_id, full_name)
);

-- テーブル⑤: letters（手紙履歴）
CREATE TABLE letters (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  contact_id UUID REFERENCES contacts(id),
  case_study_id UUID REFERENCES case_studies(id),
  why_you_angle TEXT NOT NULL,
  send_trigger TEXT,
  collected_context TEXT,
  hypothesis TEXT,
  body_text TEXT NOT NULL,
  sent_at DATE,
  file_name TEXT,
  contact_sequence INT,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- テーブル⑥: reactions（反応記録）
CREATE TABLE reactions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  letter_id UUID REFERENCES letters(id),
  reaction_type TEXT NOT NULL,
  reaction_channel TEXT,
  reacted_at DATE NOT NULL,
  days_to_react INT,
  memo TEXT,
  next_action TEXT,
  next_action_date DATE,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- インデックス設計
CREATE INDEX idx_letters_client ON letters(client_id);
CREATE INDEX idx_letters_why_you ON letters(why_you_angle);
CREATE INDEX idx_letters_trigger ON letters(send_trigger);
CREATE INDEX idx_letters_sent_at ON letters(sent_at);
CREATE INDEX idx_reactions_type ON reactions(reaction_type);
CREATE INDEX idx_contacts_company ON contacts(company_id);
CREATE INDEX idx_companies_industry ON target_companies(industry);
CREATE INDEX idx_contacts_name ON contacts(full_name);

-- 分析用ビュー
CREATE VIEW letter_analytics AS
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
