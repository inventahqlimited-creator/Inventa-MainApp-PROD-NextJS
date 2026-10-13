-- Release G — attachments on sales orders, purchase orders and transfers. Safe to run more than once.
-- A table for the file records, plus a PRIVATE storage bucket (files are only reachable through the app, which checks who is asking).

create table if not exists public.order_attachments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  entity_type text not null check (entity_type in ('sales', 'purchases', 'transfers')),
  entity_id uuid not null,
  file_name text not null,
  content_type text,
  size_bytes integer not null check (size_bytes >= 0),
  storage_path text not null,
  uploaded_by uuid,
  uploaded_by_name text,
  created_at timestamptz not null default now()
);
create index if not exists order_attachments_entity_idx on public.order_attachments (org_id, entity_type, entity_id);

alter table public.order_attachments enable row level security;
drop policy if exists "org members can view order attachments" on public.order_attachments;
create policy "org members can view order attachments" on public.order_attachments for select
  using (org_id in (select org_id from org_members where user_id = auth.uid() and invite_status = 'accepted'));

insert into storage.buckets (id, name, public) values ('order-attachments', 'order-attachments', false)
on conflict (id) do update set public = false;
