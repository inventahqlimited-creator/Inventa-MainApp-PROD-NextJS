-- Release K: stop new contacts and purchase orders silently defaulting to NZD.
-- New contacts with no currency get the organisation's base currency; a purchase order whose
-- currency isn't one the organisation uses (base or added under Settings → Currencies) falls
-- back to the base currency. Run on STAGING and PROD. Safe to re-run.

alter table public.contacts alter column currency drop default;

create or replace function public.trg_contacts_default_currency()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if new.currency is null or btrim(new.currency) = '' then
    select coalesce(nullif(btrim(o.base_currency), ''), 'NZD') into new.currency
    from organisations o where o.id = new.org_id;
  end if;
  return new;
end $$;

drop trigger if exists contacts_default_currency on public.contacts;
create trigger contacts_default_currency
  before insert or update of currency on public.contacts
  for each row execute function public.trg_contacts_default_currency();

create or replace function public.trg_po_valid_currency()
returns trigger language plpgsql security definer set search_path = public as $$
declare base text;
begin
  select nullif(btrim(o.base_currency), '') into base from organisations o where o.id = new.org_id;
  if base is null then return new; end if;
  if new.currency is null or btrim(new.currency) = ''
     or (upper(new.currency) <> upper(base)
         and not exists (select 1 from currencies c where c.org_id = new.org_id and upper(c.code) = upper(new.currency))) then
    new.currency := base;
  end if;
  return new;
end $$;

drop trigger if exists po_valid_currency on public.purchase_orders;
create trigger po_valid_currency
  before insert or update of currency on public.purchase_orders
  for each row execute function public.trg_po_valid_currency();
