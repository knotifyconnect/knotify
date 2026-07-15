-- Café rows contain partner redemption codes, so client applications must use
-- the API's role-aware response shaping rather than selecting the table.
revoke select on table public.cafes from anon, authenticated;
