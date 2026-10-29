-- Release H (part 3) — Kits on sales orders. Safe to run more than once.
--  • kit_group: ties a kit line to its item lines (same value on all of them)
--  • is_kit_parent: true on the kit line itself
--  • kit_qty_per: on an item line, how many of it go into ONE kit
--  • kit_unit_cost: on the kit line, the cost of one kit when it was sold (kept for reports even if costs change later)
alter table public.sales_order_lines add column if not exists kit_group uuid;
alter table public.sales_order_lines add column if not exists is_kit_parent boolean not null default false;
alter table public.sales_order_lines add column if not exists kit_qty_per numeric;
alter table public.sales_order_lines add column if not exists kit_unit_cost numeric;
create index if not exists sales_order_lines_kit_group_idx on public.sales_order_lines (kit_group) where kit_group is not null;

-- A kit holds no stock of its own (its items do), so it is not stock-tracked. Fixes kits made before this release.
update public.products set track_stock = false where is_kit = true and track_stock is distinct from false;
