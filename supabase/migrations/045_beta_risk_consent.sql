-- Track the mandatory beta-risk acknowledgement on the waiting list.
-- Joining the beta requires the user to confirm they understand this is an
-- early beta that may have bugs, incomplete features and security risks.
-- This is a legal acknowledgement, stored separately from marketing consent.

alter table beta_signups add column if not exists beta_risk_consent boolean not null default false;
alter table beta_signups add column if not exists beta_risk_version text;
alter table beta_signups add column if not exists beta_risk_given_at timestamptz;
