-- Customer email is required for new checkout requests and remains nullable
-- in storage so orders created before this migration stay compatible.

alter table public.orders
  add column if not exists customer_email text;

comment on column public.orders.customer_email is
  'Normalized customer email used for order communication and fiscal receipts; nullable for legacy orders.';
