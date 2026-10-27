-- Заказ кейтеринга хранится структурированно: формат, адрес, персоны, комментарий, состав и сумма.
-- Сумма считается на сервере по ценам из таблицы services: цену с клиента не принимаем.
-- bookings.price_cents теперь равно сумме всего заказа, поэтому статистика и оплаты в кабинете считаются верно.

alter table bookings add column if not exists total_cents int;
alter table bookings add column if not exists order_items jsonb;
alter table bookings alter column guest_count drop not null;   -- у доставки персон нет

-- Убираем все прежние версии, чтобы не получить перегрузки и ошибку «function is not unique».
drop function if exists create_booking(text, uuid, timestamptz, text, text, text, text, text, text);
drop function if exists create_booking(text, uuid, timestamptz, text, text, text, text, text, text, text, int, text, text);
drop function if exists owner_create_booking(text, uuid, timestamptz, text, text, text);

create function create_booking(
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
revoke all on function create_booking(text, uuid, timestamptz, text, text, text, text, text, text, text, text, int, text, jsonb) from public;
grant execute on function create_booking(text, uuid, timestamptz, text, text, text, text, text, text, text, text, int, text, jsonb) to anon, authenticated;

-- Заказ, который вносит владелец (по телефону или лично): согласие помечается как 'staff'.
create function owner_create_booking(
  p_slug text, p_service uuid, p_start timestamptz, p_name text, p_phone text, p_car text,
  p_service_type text default 'delivery', p_address text default null, p_guests int default null,
  p_allergies text default null, p_items jsonb default null
) returns uuid language plpgsql security definer set search_path=public, extensions as $$
declare v uuid;
begin
  perform owner_tenant(p_slug);
  select c.booking_id into v from create_booking(
    p_slug => p_slug, p_service => p_service, p_start => p_start, p_name => p_name, p_phone => p_phone, p_car => p_car,
    p_key => gen_random_uuid()::text, p_token => encode(gen_random_bytes(16), 'hex'), p_consent => 'staff',
    p_service_type => p_service_type, p_address => p_address, p_guests => p_guests,
    p_allergies => p_allergies, p_items => p_items) c;
  return v;
end $$;
revoke all on function owner_create_booking(text, uuid, timestamptz, text, text, text, text, text, int, text, jsonb) from public;
grant execute on function owner_create_booking(text, uuid, timestamptz, text, text, text, text, text, int, text, jsonb) to authenticated;

-- При удалении данных клиента стираем и адрес с комментарием: это тоже персональные данные.
create or replace function owner_erase_customer(p_booking uuid) returns void language plpgsql security definer set search_path=public as $$
declare t uuid;
begin
  t := owner_booking_tenant(p_booking);
  update bookings set customer_name = 'Удалено', customer_phone = '', car = 'Удалено',
    venue_address = null, allergies = null, user_id = null where id = p_booking;
end $$;
