create table if not exists beta_signups (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  marketing_consent boolean not null default false,
  consent_version text not null default 'v1',
  consent_given_at timestamptz,
  ip_address text,
  source text default 'landing',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  created_at timestamptz not null default now()
);

create index if not exists beta_signups_email_idx on beta_signups(email);
create index if not exists beta_signups_status_idx on beta_signups(status);
create index if not exists beta_signups_created_at_idx on beta_signups(created_at desc);
