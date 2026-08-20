-- Store only server-created YooKassa payment data on the order.
-- Existing orders remain unpaid and compatible because every new field is nullable.

alter table public.orders
  add column if not exists yookassa_payment_id text,
  add column if not exists yookassa_payment_url text,
  add column if not exists yookassa_idempotence_key uuid,
  add column if not exists yookassa_payment_amount integer,
  add column if not exists yookassa_attempt_created_at timestamptz;

alter table public.orders
  drop constraint if exists orders_yookassa_payment_pair_check,
  drop constraint if exists orders_yookassa_attempt_pair_check,
  drop constraint if exists orders_yookassa_payment_amount_check,
  drop constraint if exists orders_yookassa_payment_attempt_check;

-- Safe if an earlier revision added the attempt fields before this timestamp.
update public.orders
set yookassa_attempt_created_at = coalesce(updated_at, now())
where yookassa_idempotence_key is not null
  and yookassa_payment_amount is not null
  and yookassa_attempt_created_at is null;

alter table public.orders
  add constraint orders_yookassa_payment_pair_check
    check (yookassa_payment_url is null or yookassa_payment_id is not null),
  add constraint orders_yookassa_attempt_pair_check
    check (
      (yookassa_idempotence_key is null) = (yookassa_payment_amount is null)
      and (yookassa_idempotence_key is null) = (yookassa_attempt_created_at is null)
    ),
  add constraint orders_yookassa_payment_amount_check
    check (
      yookassa_payment_amount is null
      or (yookassa_payment_amount > 0 and yookassa_payment_amount = total)
    ),
  add constraint orders_yookassa_payment_attempt_check
    check (yookassa_payment_id is null or yookassa_idempotence_key is not null);

create unique index if not exists orders_yookassa_payment_id_uidx
  on public.orders(yookassa_payment_id)
  where yookassa_payment_id is not null;

comment on column public.orders.yookassa_payment_id is
  'Current YooKassa payment identifier. Written only by server-side payment code.';
comment on column public.orders.yookassa_payment_url is
  'Current YooKassa SBP confirmation URL. Never accepted from a client request.';
comment on column public.orders.yookassa_idempotence_key is
  'Stable Idempotence-Key for retrying the current YooKassa payment creation.';
comment on column public.orders.yookassa_payment_amount is
  'Frozen amount in whole RUB for verification of the current payment attempt.';
comment on column public.orders.yookassa_attempt_created_at is
  'Creation time of the current idempotent attempt; retries stop before the 24-hour guarantee ends.';
