-- Add next_action_log column to reactions table
-- This stores the reasoning/context behind the next action decision (for handoff)
ALTER TABLE reactions ADD COLUMN next_action_log TEXT;
