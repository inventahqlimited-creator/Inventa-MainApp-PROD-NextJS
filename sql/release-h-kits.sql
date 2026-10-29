-- Release H — Kits & Bundles (foundation). Safe to run more than once.
--  • organisations.addons: per-organisation add-on switches, set from the Hub (e.g. {"kits": true}).
--  • products.is_kit: this product is a kit / bundle (must be Non Stock).
--  • product_bom_lines: a kit's Bill of Materials (component + quantity + an indicative "guide" price).
--  • Rules are also enforced here, so no screen or import can break them.

alter table public.organisations add column if not exists addons jsonb not null default '{}'::jsonb;
alter table public.products add column if not exists is_kit boolean not null default false;

create table if not exists public.product_bom_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  kit_id uuid not null references public.products(id) on delete cascade,
  component_id uuid not null references public.products(id) on delete restrict,
  quantity numeric not null check (quantity > 0),
  guide_price numeric check (guide_price is null or guide_price >= 0), -- null = follow the component's current selling price
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  unique (kit_id, component_id)
);
create index if not exists product_bom_lines_kit_idx on public.product_bom_lines (org_id, kit_id);
create index if not exists product_bom_lines_component_idx on public.product_bom_lines (org_id, component_id);

alter table public.product_bom_lines enable row level security;
drop policy if exists "org members can view bill of materials" on public.product_bom_lines;
create policy "org members can view bill of materials" on public.product_bom_lines for select
  using (org_id in (select org_id from org_members where user_id = auth.uid() and invite_status = 'accepted'));

-- A line: the kit must be Non Stock, a component can't be a kit, a kit can't contain itself.
create or replace function public.check_bom_line() returns trigger language plpgsql as $$
declare k record; c record;
begin
  if new.kit_id = new.component_id then
    raise exception 'KIT: A kit can’t contain itself.' using errcode = 'P0001';
  end if;
  select id, org_id, type, name into k from public.products where id = new.kit_id;
  select id, org_id, is_kit, name into c from public.products where id = new.component_id;
  if k.id is null or c.id is null or k.org_id <> new.org_id or c.org_id <> new.org_id then
    raise exception 'KIT: That item could not be found.' using errcode = 'P0001';
  end if;
  if k.type <> 'NonStock' then
    raise exception 'KIT: “%” needs to be a Non Stock item before it can be a kit. Change its stock type first.', k.name using errcode = 'P0001';
  end if;
  if c.is_kit then
    raise exception 'KIT: “%” is itself a kit, and kits can’t contain other kits.', c.name using errcode = 'P0001';
  end if;
  return new;
end $$;
drop trigger if exists product_bom_lines_check on public.product_bom_lines;
create trigger product_bom_lines_check before insert or update on public.product_bom_lines
  for each row execute function public.check_bom_line();

-- A product: only a Non Stock item with no stock can become a kit; a kit stays Non Stock;
-- an item used inside another kit can't become a kit.
create or replace function public.check_product_kit() returns trigger language plpgsql as $$
begin
  if new.is_kit then
    if new.type <> 'NonStock' then
      raise exception 'KIT: A kit has to be a Non Stock item. Change the stock type to Non Stock first.' using errcode = 'P0001';
    end if;
    if tg_op = 'INSERT' or coalesce(old.is_kit, false) = false then
      if exists (select 1 from public.stock_levels where product_id = new.id and quantity <> 0) then
        raise exception 'KIT: “%” has stock on hand, so it can’t become a kit. Change it to Non Stock (clearing its stock) first.', new.name using errcode = 'P0001';
      end if;
      if exists (select 1 from public.product_bom_lines where component_id = new.id) then
        raise exception 'KIT: “%” is used inside another kit, and kits can’t contain other kits.', new.name using errcode = 'P0001';
      end if;
    end if;
  end if;
  return new;
end $$;
drop trigger if exists products_kit_check on public.products;
create trigger products_kit_check before insert or update of is_kit, type on public.products
  for each row execute function public.check_product_kit();
