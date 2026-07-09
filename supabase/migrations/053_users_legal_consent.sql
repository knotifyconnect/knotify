-- Track the mandatory legal consent (Terms of Service + Privacy Policy) given
-- at account creation. Recorded server-side (not trusting a client timestamp)
-- so every account has verifiable proof of consent, not just a UI checkbox.

alter table users add column if not exists terms_accepted_at timestamptz;
alter table users add column if not exists terms_version text;
