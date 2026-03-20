-- Import logs table for tracking import history
CREATE TABLE IF NOT EXISTS import_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID REFERENCES clients(id),
  file_name TEXT NOT NULL,
  imported_at TIMESTAMPTZ DEFAULT now(),
  total_rows INT,
  added_rows INT,
  updated_rows INT,
  skipped_rows INT,
  error_rows INT,
  error_details JSONB,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Track which import batch a contact came from
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS import_log_id UUID REFERENCES import_logs(id);
