-- Allow full_name to be NULL for corporate-only contacts
ALTER TABLE contacts ALTER COLUMN full_name DROP NOT NULL;

-- Drop the old unique constraint and replace with one that allows multiple NULL names per company
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_company_id_full_name_key;
