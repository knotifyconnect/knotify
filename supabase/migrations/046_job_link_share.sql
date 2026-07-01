-- 046_job_link_share.sql — peer-to-peer job sharing by pasting a link.
--
-- Jobs today require a verified company_id owned by an HR/admin member
-- (posted via HrPage). This adds a second path: any member pastes a job
-- posting URL, we scrape + extract the details, and it posts as its own
-- listing with an external apply_url — no company row needed, no referral
-- flow (we don't have insiders at an arbitrary scraped company). "Apply"
-- on these just sends the applicant to apply_url.

alter table jobs alter column company_id drop not null;

alter table jobs add column if not exists company_name     text;
alter table jobs add column if not exists company_logo_url text;
alter table jobs add column if not exists apply_url        text;
alter table jobs add column if not exists source           text not null default 'employer'
  check (source in ('employer','link_share'));

-- Either a real company row, or a scraped company name — never neither.
alter table jobs add constraint jobs_company_identified_chk
  check (company_id is not null or company_name is not null);

-- Link-shared jobs always carry an apply_url (external application target).
alter table jobs add constraint jobs_link_share_apply_url_chk
  check (source <> 'link_share' or apply_url is not null);
