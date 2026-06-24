-- 041_access_mode.sql — unified access model.
--
-- access_mode:        'open'        → anyone can sign up
--                     'invite_only' → only valid invites, approved waitlist emails,
--                                      or admins can create an account; everyone
--                                      else is shown the waitlist.
-- team_invite_code:   a reserved code the team uses to test signups without
--                     flipping the whole site open. Grants access, no attribution.
--
-- Seed access_mode from the existing beta_open boolean so behaviour is preserved:
--   beta_open = true  → 'open'
--   beta_open = false → 'invite_only'

insert into app_settings (key, value)
values (
  'access_mode',
  case
    when coalesce((select value from app_settings where key = 'beta_open'), 'true') = 'false'
      then '"invite_only"'::jsonb
    else '"open"'::jsonb
  end
)
on conflict (key) do nothing;

insert into app_settings (key, value)
values ('team_invite_code', '"KNOTIFYTEAM"'::jsonb)
on conflict (key) do nothing;
