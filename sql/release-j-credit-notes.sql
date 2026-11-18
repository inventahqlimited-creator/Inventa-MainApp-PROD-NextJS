-- Release J — Sales Returns (credit notes against a closed sales order)
-- Safe to run more than once. Run on STAGING first, then PROD before deploying.

-- 1. Settings (Settings → Sales → Credit Notes): {enabled, prefix, suffix, start, digits, xero_status, template}
alter table public.organisations add column if not exists credit_note_settings jsonb not null default '{}'::jsonb;

-- 2. Credit notes
create table if not exists public.credit_notes (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  cn_number text not null,
  so_id uuid not null references public.sales_orders(id) on delete restrict,
  so_number text,
  invoice_number text,
  customer_id uuid references public.contacts(id) on delete set null,
  customer_name text,
  location_id uuid references public.locations(id) on delete set null,
  location_name text,
  status text not null default 'Open' check (status in ('Open', 'Closed', 'Cancelled')),
  return_date date not null default current_date,
  reason text not null,
  notes text,
  currency text,
  total_amount numeric not null default 0,
  created_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz,
  closed_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (org_id, cn_number)
);
create index if not exists credit_notes_org_status_idx on public.credit_notes (org_id, status);
create index if not exists credit_notes_so_idx on public.credit_notes (so_id);

create table if not exists public.credit_note_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  cn_id uuid not null references public.credit_notes(id) on delete cascade,
  so_line_id uuid references public.sales_order_lines(id) on delete set null,
  product_id uuid not null references public.products(id),
  product_name text,
  product_sku text,
  unit text,
  quantity numeric not null check (quantity > 0),
  unit_price numeric not null default 0,
  discount numeric not null default 0,
  tax_rate numeric not null default 0,
  tax_rate_id uuid,
  tax_name text,
  is_kit_parent boolean not null default false,
  bin_id text,
  serial_number text,
  batch_number text,
  expiry_date date,
  sort_order integer not null default 0
);
create index if not exists credit_note_lines_cn_idx on public.credit_note_lines (cn_id);
create index if not exists credit_note_lines_so_line_idx on public.credit_note_lines (so_line_id);

drop trigger if exists credit_notes_set_updated_at on public.credit_notes;
create trigger credit_notes_set_updated_at before update on public.credit_notes
  for each row execute function public.set_updated_at();

-- 3. Row level security (same rule as the other order tables)
alter table public.credit_notes enable row level security;
alter table public.credit_note_lines enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename = 'credit_notes' and policyname = 'org members can read credit_notes') then
    create policy "org members can read credit_notes" on public.credit_notes for select using (org_id = get_my_org_id());
    create policy "org members can insert credit_notes" on public.credit_notes for insert with check (org_id = get_my_org_id());
    create policy "org members can update credit_notes" on public.credit_notes for update using (org_id = get_my_org_id());
    create policy "org members can delete credit_notes" on public.credit_notes for delete using (org_id = get_my_org_id());
  end if;
  if not exists (select 1 from pg_policies where tablename = 'credit_note_lines' and policyname = 'org members can read credit_note_lines') then
    create policy "org members can read credit_note_lines" on public.credit_note_lines for select using (org_id = get_my_org_id());
    create policy "org members can insert credit_note_lines" on public.credit_note_lines for insert with check (org_id = get_my_org_id());
    create policy "org members can update credit_note_lines" on public.credit_note_lines for update using (org_id = get_my_org_id());
    create policy "org members can delete credit_note_lines" on public.credit_note_lines for delete using (org_id = get_my_org_id());
  end if;
end $$;

-- 4. Xero sync records may now hold credit notes
alter table public.xero_sync_records drop constraint if exists xero_sync_records_entity_check;
alter table public.xero_sync_records add constraint xero_sync_records_entity_check
  check (entity = any (array['contact','product','invoice','bill','adjustment','credit_note']));

-- 5. Close a credit note: stock comes back in, the credit note is locked. One transaction.
create or replace function public.close_credit_note(p_cn uuid, p_org uuid, p_user text default null)
returns jsonb
language plpgsql
set search_path to 'public'
as $$
declare
  v_cn credit_notes%rowtype; l record; v_f numeric; v_units numeric; v_cost numeric; v_over text := '';
begin
  select * into v_cn from credit_notes where id = p_cn and org_id = p_org for update;
  if not found then raise exception 'Credit note not found'; end if;
  if v_cn.status <> 'Open' then raise exception 'Only Open credit notes can be closed (this one is %)', v_cn.status; end if;
  if v_cn.location_id is null then raise exception 'Choose the location the stock is returned to'; end if;
  if not exists (select 1 from credit_note_lines where cn_id = p_cn) then raise exception 'Add at least one item to return'; end if;

  -- Never return more than shipped (counting every other Open or Closed credit note on the same order line)
  for l in
    select sol.product_name, sol.quantity_shipped as shipped,
           sum(cl.quantity) as mine,
           coalesce((select sum(o.quantity) from credit_note_lines o join credit_notes oc on oc.id = o.cn_id
                      where o.so_line_id = sol.id and oc.id <> p_cn and oc.status in ('Open', 'Closed')), 0) as others
      from credit_note_lines cl join sales_order_lines sol on sol.id = cl.so_line_id
     where cl.cn_id = p_cn
     group by sol.id, sol.product_name, sol.quantity_shipped
  loop
    if l.mine + l.others > l.shipped then
      v_over := v_over || case when v_over = '' then '' else '; ' end || format('%s (shipped %s, already returned %s, this return %s)', l.product_name, l.shipped, l.others, l.mine);
    end if;
  end loop;
  if v_over <> '' then raise exception 'Can''t return more than was shipped: %', v_over; end if;

  for l in
    select cl.*, pr.track_stock, pr.type as ptype, pr.avg_cost, coalesce(nullif(pr.sell_uom_qty, 0), 1) as f
      from credit_note_lines cl join products pr on pr.id = cl.product_id
     where cl.cn_id = p_cn
     order by cl.sort_order, cl.id
  loop
    continue when l.is_kit_parent or not coalesce(l.track_stock, true) or coalesce(l.ptype, '') = 'Service';
    v_f := l.f;
    v_units := l.quantity * v_f;
    -- back in at what it cost when it went out
    select avg(unit_cost) into v_cost from stock_movements
     where org_id = p_org and reference_id = v_cn.so_id and reference_type = 'sales_order'
       and product_id = l.product_id and movement_type = 'sale' and unit_cost is not null;
    v_cost := coalesce(v_cost, l.avg_cost);

    perform upsert_stock_level(p_org, l.product_id, v_cn.location_id, v_units, 0, 0);
    perform add_stock_group(p_org, l.product_id, v_cn.location_id, l.batch_number, l.serial_number, l.expiry_date, l.bin_id, v_units);
    insert into stock_movements (org_id, product_id, location_id, movement_type, qty, unit_cost, unit_price,
      reference_id, reference_type, note, created_by, bin_id, serial_number, batch_number, expiry_date)
    values (p_org, l.product_id, v_cn.location_id, 'return', v_units, v_cost,
      l.unit_price * (1 - coalesce(l.discount, 0) / 100) / v_f,
      p_cn, 'credit_note', 'Returned ' || v_cn.cn_number || ' (' || coalesce(v_cn.so_number, '') || ')', p_user,
      l.bin_id, l.serial_number, l.batch_number, l.expiry_date);
  end loop;

  update credit_notes set status = 'Closed', closed_at = now(), closed_by = p_user where id = p_cn;

  -- History: on the credit note and on the order it came from (never stops the close)
  begin
    perform audit_write(p_org, 'Sales', 'Credit Note Closed', v_cn.cn_number, 'Stock returned to ' || coalesce(v_cn.location_name, 'location'), 'credit_notes', p_cn);
    perform audit_write(p_org, 'Sales', 'Credit Note Closed', v_cn.cn_number, 'Credit note ' || v_cn.cn_number || ' closed against ' || coalesce(v_cn.so_number, 'this order'), 'sales_orders', v_cn.so_id);
  exception when others then null;
  end;
  return jsonb_build_object('new_status', 'Closed');
end $$;
