-- Add availability and niche-asks fields to user profiles
ALTER TABLE users
  ADD COLUMN IF NOT EXISTS open_to_roles BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS asks_per_month INTEGER CHECK (asks_per_month >= 0 AND asks_per_month <= 30),
  ADD COLUMN IF NOT EXISTS can_help_with TEXT CHECK (char_length(can_help_with) <= 300);
