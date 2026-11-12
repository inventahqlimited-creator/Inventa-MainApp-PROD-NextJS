-- Release I: saved defaults for new contacts (Settings → Contacts). Run on STAGING and PROD. Safe to re-run.
alter table public.organisations add column if not exists contact_defaults jsonb not null default '{}'::jsonb;
