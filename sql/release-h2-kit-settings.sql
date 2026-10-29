-- Release H (part 2) — Settings > Kits & Bundles. Safe to run more than once.
-- Stores each organisation's kit settings (expand in sales / purchases / transfers, what each printed document shows, virtual stock).
alter table public.organisations add column if not exists kit_settings jsonb not null default '{}'::jsonb;
