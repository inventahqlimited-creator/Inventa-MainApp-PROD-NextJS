-- Release H (part 4) — Kits on purchase orders and transfers. Safe to run more than once.
--  • kit_group: ties a kit line to its item lines (same value on all of them)
--  • is_kit_parent: true on the kit line itself (a heading — it holds no quantity of its own, so receiving, picking and totals ignore it)
--  • kit_qty_per: on an item line, how many of it go into ONE kit
--  • kit_qty: on the kit line, how many kits were ordered / transferred
alter table public.purchase_order_lines add column if not exists kit_group uuid;
alter table public.purchase_order_lines add column if not exists is_kit_parent boolean not null default false;
alter table public.purchase_order_lines add column if not exists kit_qty_per numeric;
alter table public.purchase_order_lines add column if not exists kit_qty numeric;
create index if not exists purchase_order_lines_kit_group_idx on public.purchase_order_lines (kit_group) where kit_group is not null;

alter table public.transfer_order_lines add column if not exists kit_group uuid;
alter table public.transfer_order_lines add column if not exists is_kit_parent boolean not null default false;
alter table public.transfer_order_lines add column if not exists kit_qty_per numeric;
alter table public.transfer_order_lines add column if not exists kit_qty numeric;
create index if not exists transfer_order_lines_kit_group_idx on public.transfer_order_lines (kit_group) where kit_group is not null;
