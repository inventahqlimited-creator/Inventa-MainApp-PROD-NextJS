-- Release F — receiving a purchase order now records stock groups (serial / batch / expiry / bin),
-- so tracked stock shows up on the Pick screen and in the Products module. Safe to run more than once.
-- Part 1 changes receiving from now on. Part 2 repairs stock that was received before this release.

-- Helper: add qty to the stock group for this exact serial/batch/expiry/bin, creating it if needed
create or replace function public.add_stock_group(p_org uuid, p_product uuid, p_location uuid, p_batch text, p_serial text, p_expiry date, p_bin text, p_qty numeric)
returns void language plpgsql set search_path to 'public' as $$
declare v_id uuid;
begin
  select id into v_id from stock_groups
   where org_id = p_org and product_id = p_product and location_id = p_location
     and batch_number is not distinct from p_batch and serial_number is not distinct from p_serial
     and expiry_date is not distinct from p_expiry and bin_id is not distinct from p_bin
   limit 1 for update;
  if found then
    update stock_groups set quantity = quantity + p_qty, updated_at = now() where id = v_id;
  else
    insert into stock_groups (org_id, product_id, location_id, batch_number, serial_number, expiry_date, bin_id, quantity)
    values (p_org, p_product, p_location, p_batch, p_serial, p_expiry, p_bin, p_qty);
  end if;
end $$;

-- Part 1: receiving
create or replace function public.receive_purchase_order(p_po uuid, p_org uuid, p_lines jsonb, p_user text default null, p_notes text default null, p_backorder boolean default false, p_bin text default null, p_date date default null)
returns jsonb language plpgsql set search_path to 'public' as $$
declare
  v_po purchase_orders%rowtype;
  l jsonb;
  pl record;
  v_qty numeric; v_factor numeric; v_units numeric; v_cost numeric;
  v_onhand numeric; v_remaining numeric;
  v_batch text; v_expiry date; s text;
  v_any boolean := false; v_all boolean; v_status text;
  v_allow boolean;
  v_date date := coalesce(p_date, current_date);
  v_base text; v_code int; v_bo_number text; v_bo_id uuid; v_bo_total numeric;
begin
  select * into v_po from purchase_orders where id = p_po and org_id = p_org for update;
  if not found then raise exception 'Purchase order not found'; end if;
  if lower(v_po.status) not in ('open', 'partially received') then
    raise exception 'Only Open or Partially Received orders can be received (this one is %)', v_po.status;
  end if;
  if v_po.location_id is null then raise exception 'This order has no delivery location'; end if;

  select coalesce(allow_over_receive, false) into v_allow from organisations where id = p_org;
  v_allow := coalesce(v_allow, false);

  for l in select * from jsonb_array_elements(coalesce(p_lines, '[]'::jsonb)) loop
    v_qty := coalesce(nullif(l->>'qty_to_receive', '')::numeric, 0);
    continue when v_qty <= 0;

    select pol.id, pol.product_id, pol.product_name, pol.quantity_ordered, pol.quantity_received,
           pol.unit_cost, pol.discount, pr.buy_uom_qty
      into pl
      from purchase_order_lines pol
      join products pr on pr.id = pol.product_id
     where pol.id = (l->>'id')::uuid and pol.po_id = p_po
       for update of pol;
    if not found then raise exception 'A line on this receipt does not belong to this order'; end if;

    v_remaining := pl.quantity_ordered - coalesce(pl.quantity_received, 0);
    if v_qty > v_remaining and not v_allow then
      raise exception 'Cannot receive % of "%" — only % left to receive (over-receiving is switched off in Settings)', v_qty, pl.product_name, v_remaining;
    end if;

    v_any := true;
    v_factor := coalesce(nullif(pl.buy_uom_qty, 0), 1);
    v_units := v_qty * v_factor;
    v_cost := pl.unit_cost * (1 - coalesce(pl.discount, 0) / 100) / v_factor + coalesce(nullif(l->>'extra_unit_cost', '')::numeric, 0);
    v_batch := nullif(l->>'batch_num', '');
    v_expiry := nullif(l->>'expiry_date', '')::date;

    update purchase_order_lines set
      quantity_received = coalesce(quantity_received, 0) + v_qty,
      batch_num = coalesce(v_batch, batch_num),
      expiry_date = coalesce(v_expiry, expiry_date),
      serials = case
        when jsonb_typeof(l->'serial_numbers') = 'array' and jsonb_array_length(l->'serial_numbers') > 0
        then concat_ws(E'\n', nullif(serials, ''), (select string_agg(x, E'\n') from jsonb_array_elements_text(l->'serial_numbers') x))
        else serials end
    where id = pl.id;

    select coalesce(sum(quantity), 0) into v_onhand from stock_levels where product_id = pl.product_id;
    update products set
      last_cost = v_cost,
      avg_cost = case
        when v_onhand > 0 and avg_cost is not null then (v_onhand * avg_cost + v_units * v_cost) / (v_onhand + v_units)
        else v_cost end
    where id = pl.product_id;

    insert into stock_levels (org_id, product_id, location_id, quantity)
    values (p_org, pl.product_id, v_po.location_id, v_units)
    on conflict (product_id, location_id) do update set quantity = stock_levels.quantity + excluded.quantity;

    if jsonb_typeof(l->'serial_numbers') = 'array' and jsonb_array_length(l->'serial_numbers') > 0 then
      for s in select jsonb_array_elements_text(l->'serial_numbers') loop
        insert into stock_movements (org_id, product_id, location_id, movement_type, qty, unit_cost,
          reference_id, reference_type, note, created_by, serial_number, batch_number, expiry_date, bin_id)
        values (p_org, pl.product_id, v_po.location_id, 'purchase', v_factor, v_cost,
          p_po, 'purchase_order', p_notes, p_user, s, v_batch, v_expiry, nullif(p_bin, ''));
        perform add_stock_group(p_org, pl.product_id, v_po.location_id, v_batch, s, v_expiry, nullif(p_bin, ''), v_factor);
      end loop;
    else
      insert into stock_movements (org_id, product_id, location_id, movement_type, qty, unit_cost,
        reference_id, reference_type, note, created_by, batch_number, expiry_date, bin_id)
      values (p_org, pl.product_id, v_po.location_id, 'purchase', v_units, v_cost,
        p_po, 'purchase_order', p_notes, p_user, v_batch, v_expiry, nullif(p_bin, ''));
      -- batch / expiry / bin recorded -> keep it as a group; plain stock stays "loose" like before
      if v_batch is not null or v_expiry is not null or nullif(p_bin, '') is not null then
        perform add_stock_group(p_org, pl.product_id, v_po.location_id, v_batch, null, v_expiry, nullif(p_bin, ''), v_units);
      end if;
    end if;
  end loop;

  if not v_any then raise exception 'Enter a quantity to receive for at least one line'; end if;

  select bool_and(quantity_received >= quantity_ordered) into v_all from purchase_order_lines where po_id = p_po;

  -- Backorder: close this order at what has been received; the balance moves to a new order (PO-0001 -> PO-0001A -> PO-0001B ...)
  if p_backorder and not v_all then
    v_base := case when v_po.po_number ~ '[0-9][A-Z]$' then left(v_po.po_number, length(v_po.po_number) - 1) else v_po.po_number end;
    select max(right(po_number, 1)) into v_bo_number
      from purchase_orders
     where org_id = p_org
       and po_number ~ ('^' || regexp_replace(v_base, '([^A-Za-z0-9])', E'\\\\\\1', 'g') || '[A-Z]$');
    v_code := coalesce(ascii(v_bo_number), 64) + 1;
    if v_code > 90 then raise exception 'This order has reached the maximum number of backorders (Z)'; end if;
    v_bo_number := v_base || chr(v_code);

    select coalesce(sum((quantity_ordered - quantity_received) * unit_cost * (1 - coalesce(discount, 0) / 100)
                        * (1 + coalesce(tax_rate, 0) / 100)), 0)
      into v_bo_total
      from purchase_order_lines where po_id = p_po and quantity_ordered > quantity_received;

    insert into purchase_orders (org_id, po_number, status, supplier_id, supplier_name, location_id, location_name,
      order_date, expected_date, terms, currency, ref, reference, notes, total_amount, created_by, backorder_from_number)
    values (p_org, v_bo_number, 'Open', v_po.supplier_id, v_po.supplier_name, v_po.location_id, v_po.location_name,
      v_po.order_date, v_po.expected_date, v_po.terms, v_po.currency, v_po.ref, v_po.reference,
      'Backordered from ' || v_po.po_number || ' on ' || to_char(v_date, 'DD Mon YYYY'),
      v_bo_total, v_po.created_by, v_po.po_number)
    returning id into v_bo_id;

    insert into purchase_order_lines (org_id, po_id, product_id, product_name, product_sku, unit, quantity_ordered,
      quantity_received, unit_cost, discount, tax_rate, tax_name, tax_rate_id, line_notes, sort_order)
    select p_org, v_bo_id, product_id, product_name, product_sku, unit, quantity_ordered - quantity_received,
      0, unit_cost, discount, tax_rate, tax_name, tax_rate_id, line_notes, sort_order
      from purchase_order_lines where po_id = p_po and quantity_ordered > quantity_received;

    update purchase_orders set status = 'Closed', received_date = v_date, backorder_to_number = v_bo_number where id = p_po;
    return jsonb_build_object('new_status', 'Closed', 'backorder_id', v_bo_id, 'backorder_number', v_bo_number);
  end if;

  v_status := case when v_all then 'Closed' else 'Partially Received' end;
  update purchase_orders set
    status = v_status,
    received_date = case when v_all then v_date else received_date end
  where id = p_po;

  return jsonb_build_object('new_status', v_status);
end $$;

-- Part 2: repair stock received earlier. Only for tracked products that have NO stock groups at all.
-- Rebuilds the groups from the receipts (serial / batch / expiry / bin), newest first, up to what is on hand now.
do $$
declare
  pr record; m record; v_left numeric; v_take numeric;
begin
  for pr in
    select sl.product_id, sl.location_id, sl.org_id, sl.quantity
      from stock_levels sl
      join products p on p.id = sl.product_id
     where sl.quantity > 0
       and (p.serial_tracking or p.batch_tracking or p.expiry_tracking)
       and not exists (select 1 from stock_groups g where g.product_id = sl.product_id)
  loop
    v_left := pr.quantity;
    for m in
      select serial_number, batch_number, expiry_date, bin_id, qty
        from stock_movements
       where product_id = pr.product_id and location_id = pr.location_id and qty > 0
         and (serial_number is not null or batch_number is not null or expiry_date is not null or bin_id is not null)
       order by created_at desc, id
    loop
      exit when v_left <= 0;
      v_take := least(m.qty, v_left);
      if m.serial_number is not null
         and exists (select 1 from stock_groups g where g.org_id = pr.org_id and g.serial_number = m.serial_number) then
        continue;
      end if;
      perform add_stock_group(pr.org_id, pr.product_id, pr.location_id, m.batch_number, m.serial_number, m.expiry_date, m.bin_id, v_take);
      v_left := v_left - v_take;
    end loop;
  end loop;
end $$;
