-- Минимальная сумма заказа. Меняется владельцем в кабинете (вкладка «Заведение»), проверяется на сервере.
-- Выполнять после 0011_catering_orders.sql.
alter table tenants add column if not exists min_order_cents int not null default 0
  check (min_order_cents >= 0 and min_order_cents <= 2000000000);

create or replace function create_booking(
  p_slug text, p_service uuid, p_start timestamptz,
  p_name text, p_phone text, p_car text, p_key text, p_token text,
  p_consent text default null,                    -- по умолчанию согласия нет: без него запись не создаётся
  p_service_type text default 'delivery',         -- 'chef' (повар на выезд) или 'delivery'
  p_address text default null,
  p_guests int default null,
  p_allergies text default null,
  p_items jsonb default null                      -- [{"id": "<uuid блюда>", "qty": 2}, ...]
)
returns table(booking_id uuid, resource_id uuid, starts_at timestamptz, ends_at timestamptz)
language plpgsql security definer set search_path=public, extensions as $$
declare t tenants; s services; r record; b uuid; e timestamptz; occ_end timestamptz;
        v_items jsonb; v_total bigint;
begin
  select * into t from tenants where slug=p_slug; if not found then raise exception 'tenant_not_found'; end if;
  select * into s from services where id=p_service and tenant_id=t.id and active; if not found then raise exception 'service_not_found'; end if;
  return query select x.id, x.resource_id, x.starts_at, x.ends_at from bookings x
    where x.tenant_id=t.id and x.idempotency_key=p_key;
  if found then return; end if;
  if p_consent is null or length(trim(p_consent)) = 0 then raise exception 'consent_required'; end if;
  if p_start < now() then raise exception 'past_start'; end if;
  if p_service_type not in ('chef','delivery') then raise exception 'invalid_service_type'; end if;
  if p_guests is not null and (p_guests < 1 or p_guests > 1000) then raise exception 'invalid_guests'; end if;

  -- Состав и сумма: цены берём из базы, а не от клиента.
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    v_items := jsonb_build_array(jsonb_build_object('id', s.id, 'name', s.name, 'qty', 1, 'unit_cents', s.price_cents));
    v_total := s.price_cents;
  else
    select coalesce(jsonb_agg(jsonb_build_object('id', sv.id, 'name', sv.name, 'qty', q.qty, 'unit_cents', sv.price_cents) order by sv.name), '[]'::jsonb),
           coalesce(sum(sv.price_cents::bigint * q.qty), 0)
      into v_items, v_total
      from jsonb_to_recordset(p_items) as q(id uuid, qty int)
      join services sv on sv.id = q.id and sv.tenant_id = t.id and sv.active
     where q.qty between 1 and 99;
    if jsonb_array_length(v_items) <> jsonb_array_length(p_items) or v_total > 2000000000 then
      raise exception 'invalid_items';
    end if;
  end if;

  -- Минимальная сумма заказа. Заказы, которые вносит сам владелец ('staff'), не ограничиваются.
  if p_consent <> 'staff' and v_total < t.min_order_cents then raise exception 'min_order'; end if;

  e := p_start + make_interval(mins => s.duration_minutes);
  occ_end := e + make_interval(mins => t.buffer_minutes);
  for r in select id from resources where tenant_id=t.id order by name loop
    begin
      b := gen_random_uuid();
      insert into bookings(id,tenant_id,service_id,resource_id,starts_at,ends_at,price_cents,duration_minutes,
        customer_name,customer_phone,car,service_type,venue_address,guest_count,allergies,
        total_cents,order_items,token_hash,idempotency_key,consent_at,consent_version)
      values(b,t.id,s.id,r.id,p_start,e,v_total::int,s.duration_minutes,
        p_name,p_phone,p_car,p_service_type,p_address,p_guests,p_allergies,
        v_total::int,v_items,digest(p_token,'sha256'),p_key,now(),left(trim(p_consent),40));
      insert into resource_occupancies(tenant_id,resource_id,booking_id,kind,during)
      values(t.id,r.id,b,'booking',tstzrange(p_start,occ_end,'[)'));
      return query select b, r.id, p_start, e; return;
    exception when exclusion_violation then null;
    end;
  end loop;
  raise exception 'slot_taken';
end $$;

create function owner_set_min_order(p_slug text, p_cents int) returns void
language plpgsql security definer set search_path=public as $$
declare t uuid;
begin
  t := owner_tenant(p_slug);
  if p_cents is null or p_cents < 0 or p_cents > 2000000000 then raise exception 'invalid_amount'; end if;
  update tenants set min_order_cents = p_cents where id = t;
end $$;
revoke all on function owner_set_min_order(text, int) from public, anon;
grant execute on function owner_set_min_order(text, int) to authenticated;
