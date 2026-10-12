-- Release E: payment terms table (one list per organisation). Safe to run more than once.

create table if not exists public.payment_terms (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  type text not null default 'days' check (type in ('days','days_after_month','day_current_month','day_next_month')),
  days integer not null default 0 check (days >= 0 and days <= 999),
  source text not null default 'manual',          -- 'manual' or 'xero'
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists payment_terms_org_name_key on public.payment_terms (org_id, lower(name));
create index if not exists payment_terms_org_idx on public.payment_terms (org_id, sort_order);

alter table public.payment_terms enable row level security;
drop policy if exists "org members can manage payment terms" on public.payment_terms;
create policy "org members can manage payment terms" on public.payment_terms for all
  using (org_id in (select org_id from public.org_members where user_id = auth.uid() and invite_status = 'accepted'));

-- Give every existing organisation the standard list
insert into public.payment_terms (org_id, name, type, days, sort_order)
select o.id, t.name, 'days', t.days, t.ord
from public.organisations o
cross join (values ('Net 7', 7, 1), ('Net 14', 14, 2), ('Net 30', 30, 3), ('Net 60', 60, 4), ('COD', 0, 5), ('Prepaid', 0, 6)) as t(name, days, ord)
on conflict do nothing;
