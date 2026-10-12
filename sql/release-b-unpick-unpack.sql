-- Release B: Unpick / Unpack for sales orders, Unpick for transfers.
-- Safe to run more than once.

create or replace function public.unpick_sales_order(p_so uuid, p_org uuid, p_user text default null)
returns jsonb language plpgsql set search_path to 'public' as $$
declare v_so sales_orders%rowtype;
begin
  select * into v_so from sales_orders where id = p_so and org_id = p_org for update;
  if not found then raise exception 'Sales order not found'; end if;
  if lower(v_so.status) not in ('picking','partially picked','picked','partially packed','packed') then
    raise exception 'Only orders that have been picked can be unpicked (this one is %)', v_so.status;
  end if;
  -- packing depends on picking, so it goes too
  delete from sales_order_cartons where so_id = p_so;
  delete from sales_order_picks where so_id = p_so;
  update sales_order_lines set quantity_picked = 0, quantity_packed = 0 where so_id = p_so;
  update sales_orders set status = 'Open', carrier = null, shipping_method = null, service_type = null, tracking_number = null where id = p_so;
  return jsonb_build_object('new_status', 'Open');
end $$;

create or replace function public.unpack_sales_order(p_so uuid, p_org uuid, p_user text default null)
returns jsonb language plpgsql set search_path to 'public' as $$
declare v_so sales_orders%rowtype;
begin
  select * into v_so from sales_orders where id = p_so and org_id = p_org for update;
  if not found then raise exception 'Sales order not found'; end if;
  if lower(v_so.status) not in ('packed','partially packed') then
    raise exception 'Only packed orders can be unpacked (this one is %)', v_so.status;
  end if;
  delete from sales_order_cartons where so_id = p_so;
  update sales_order_lines set quantity_packed = 0 where so_id = p_so;
  update sales_orders set status = 'Picked', carrier = null, shipping_method = null, service_type = null, tracking_number = null where id = p_so;
  return jsonb_build_object('new_status', 'Picked');
end $$;

create or replace function public.unpick_transfer_order(p_tr uuid, p_org uuid, p_user text default null)
returns jsonb language plpgsql set search_path to 'public' as $$
declare v_tr transfer_orders%rowtype;
begin
  select * into v_tr from transfer_orders where id = p_tr and org_id = p_org for update;
  if not found then raise exception 'Transfer not found'; end if;
  if lower(v_tr.status) not in ('picking','picked') then
    raise exception 'Only picked transfers can be unpicked (this one is %)', v_tr.status;
  end if;
  delete from transfer_order_picks where tr_id = p_tr;
  update transfer_order_lines set quantity_picked = 0 where tr_id = p_tr;
  update transfer_orders set status = 'Open' where id = p_tr;
  return jsonb_build_object('new_status', 'Open');
end $$;
