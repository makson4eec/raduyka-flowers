begin;

create table if not exists public.app_schema_migrations (
  migration_key text primary key,
  applied_at timestamptz not null default now()
);

alter table public.app_schema_migrations enable row level security;
revoke all on table public.app_schema_migrations from public, anon, authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null,
  bonus_balance integer not null default 0,
  welcome_bonus_granted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_name_check
    check (char_length(btrim(name)) between 1 and 100)
);

-- Keep this file safe to rerun for projects that already have profiles.
alter table public.profiles
  add column if not exists bonus_balance integer,
  add column if not exists welcome_bonus_granted_at timestamptz;

update public.profiles
set bonus_balance = 0
where bonus_balance is null;

alter table public.profiles
  alter column bonus_balance set default 0,
  alter column bonus_balance set not null;

-- A negative balance is a server-managed debt. It can only be produced when
-- already-spent earned bonuses must be clawed back after a refund. Spending
-- always clamps the available balance to zero until future accrual clears it.
alter table public.profiles
  drop constraint if exists profiles_bonus_balance_check;

-- Normalize legacy profiles exactly once. Older revisions credited 1000 before
-- email confirmation; unconfirmed accounts lose that early credit and receive
-- it from the confirmation trigger below. Confirmed accounts keep their balance
-- and are marked so the bonus can never be granted twice.
do $welcome_bonus_migration$
begin
  if not exists (
    select 1
    from public.app_schema_migrations
    where migration_key = 'welcome_bonus_after_confirmation_v1'
  ) then
    update public.profiles as profile
    set
      bonus_balance = greatest(profile.bonus_balance - 1000, 0),
      welcome_bonus_granted_at = null
    from auth.users as auth_user
    where auth_user.id = profile.id
      and auth_user.email_confirmed_at is null;

    update public.profiles as profile
    set welcome_bonus_granted_at = coalesce(
      profile.welcome_bonus_granted_at,
      auth_user.email_confirmed_at,
      profile.created_at
    )
    from auth.users as auth_user
    where auth_user.id = profile.id
      and auth_user.email_confirmed_at is not null
      and profile.welcome_bonus_granted_at is null;

    insert into public.app_schema_migrations (migration_key)
    values ('welcome_bonus_after_confirmation_v1');
  end if;
end;
$welcome_bonus_migration$;

-- Backfill accounts created before the profile trigger was installed.
insert into public.profiles (
  id,
  name,
  bonus_balance,
  welcome_bonus_granted_at,
  created_at,
  updated_at
)
select
  auth_user.id,
  left(
    coalesce(
      nullif(btrim(auth_user.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(auth_user.email, ''), '@', 1), ''),
      'Покупатель'
    ),
    100
  ),
  case when auth_user.email_confirmed_at is not null then 1000 else 0 end,
  case when auth_user.email_confirmed_at is not null then now() else null end,
  coalesce(auth_user.created_at, now()),
  now()
from auth.users as auth_user
left join public.profiles as profile on profile.id = auth_user.id
where profile.id is null
on conflict (id) do nothing;

create table if not exists public.bonus_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  order_id uuid not null,
  operation text not null,
  amount integer not null,
  created_at timestamptz not null default now(),

  constraint bonus_transactions_operation_check
    check (operation in ('spend', 'spend_release', 'earn', 'earn_reversal')),
  constraint bonus_transactions_amount_check
    check (amount >= 0),
  constraint bonus_transactions_order_operation_unique
    unique (order_id, operation)
);

-- Repair the upgrade path from the earlier reminder-only schema. That
-- version had no bonus columns, so an already-confirmed account starts this
-- schema with balance 0. The v1 normalizer marks it as granted without adding
-- the promised 1000. This one-time migration restores that welcome bonus, but
-- only when the account has no bonus transaction history.
do $existing_confirmed_welcome_bonus_repair$
begin
  if not exists (
    select 1
    from public.app_schema_migrations
    where migration_key = 'existing_confirmed_welcome_bonus_repair_v1'
  ) then
    update public.profiles as profile
    set
      bonus_balance = 1000,
      welcome_bonus_granted_at = coalesce(
        profile.welcome_bonus_granted_at,
        auth_user.email_confirmed_at,
        now()
      )
    from auth.users as auth_user
    where auth_user.id = profile.id
      and auth_user.email_confirmed_at is not null
      and profile.bonus_balance = 0
      and not exists (
        select 1
        from public.bonus_transactions as bonus_tx
        where bonus_tx.user_id = profile.id
      );

    insert into public.app_schema_migrations (migration_key)
    values ('existing_confirmed_welcome_bonus_repair_v1');
  end if;
end;
$existing_confirmed_welcome_bonus_repair$;

create table if not exists public.reminders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  person_name text,
  event_type text not null,
  event_day smallint not null,
  event_month smallint not null,
  event_year integer,
  notify_7_days boolean not null default true,
  notify_3_days boolean not null default true,
  notify_1_day boolean not null default true,
  notify_same_day boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint reminders_title_check
    check (char_length(btrim(title)) between 1 and 120),
  constraint reminders_person_name_check
    check (
      person_name is null
      or char_length(btrim(person_name)) between 1 and 100
    ),
  constraint reminders_event_type_check
    check (event_type in ('birthday', 'anniversary', 'holiday', 'other')),
  constraint reminders_event_month_check
    check (event_month between 1 and 12),
  constraint reminders_event_day_check
    check (event_day between 1 and 31),
  constraint reminders_event_year_check
    check (event_year is null or event_year between 1900 and 9999),
  constraint reminders_real_event_date_check
    check (
      event_day <= case
        when event_month = 2 then
          case
            when event_year is null then 29
            when event_year % 400 = 0
              or (event_year % 4 = 0 and event_year % 100 <> 0)
              then 29
            else 28
          end
        when event_month in (4, 6, 9, 11) then 30
        else 31
      end
    ),
  constraint reminders_id_user_unique unique (id, user_id)
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  firebase_installation_id text not null unique,
  user_agent text,
  is_active boolean not null default true,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint push_subscriptions_installation_id_check
    check (
      char_length(btrim(firebase_installation_id)) between 10 and 255
    ),
  constraint push_subscriptions_user_agent_check
    check (user_agent is null or char_length(user_agent) <= 500)
);

create table if not exists public.notification_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null,
  reminder_id uuid not null,
  notification_type smallint not null,
  event_year integer not null,
  event_date date not null,
  status text not null default 'processing',
  claimed_at timestamptz not null default now(),
  sent_at timestamptz,
  success_count integer not null default 0,
  failure_count integer not null default 0,
  error_text text,
  updated_at timestamptz not null default now(),

  constraint notification_logs_reminder_owner_fk
    foreign key (reminder_id, user_id)
    references public.reminders(id, user_id)
    on delete cascade,
  constraint notification_logs_type_check
    check (notification_type in (0, 1, 3, 7)),
  constraint notification_logs_year_check
    check (event_year between 1900 and 9999),
  constraint notification_logs_date_year_check
    check (event_year = extract(year from event_date)::integer),
  constraint notification_logs_status_check
    check (status in ('processing', 'sent', 'partial', 'failed')),
  constraint notification_logs_counts_check
    check (success_count >= 0 and failure_count >= 0),
  constraint notification_logs_error_check
    check (error_text is null or char_length(error_text) <= 2000),
  constraint notification_logs_once_per_year
    unique (reminder_id, notification_type, event_year)
);

create index if not exists reminders_user_event_idx
  on public.reminders(user_id, event_month, event_day);

create index if not exists reminders_enabled_event_idx
  on public.reminders(event_month, event_day, user_id)
  where notify_7_days or notify_3_days or notify_1_day or notify_same_day;

create index if not exists push_subscriptions_active_user_idx
  on public.push_subscriptions(user_id)
  where is_active;

create index if not exists notification_logs_user_sent_idx
  on public.notification_logs(user_id, sent_at desc);

create index if not exists bonus_transactions_user_created_idx
  on public.bonus_transactions(user_id, created_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function public.reserve_order_bonus(
  p_user_id uuid,
  p_order_id uuid,
  p_eligible_amount integer
)
returns table (
  bonus_spent integer,
  bonus_earned integer,
  bonus_balance integer
)
language plpgsql
security definer
set search_path = ''
as $bonus_reserve$
declare
  current_balance integer;
  existing_spend integer;
  current_earned integer;
begin
  if p_user_id is null
    or p_order_id is null
    or p_eligible_amount is null
    or p_eligible_amount < 0
  then
    raise exception 'Invalid bonus reservation arguments';
  end if;

  select profile.bonus_balance
  into current_balance
  from public.profiles as profile
  where profile.id = p_user_id
  for update;

  if not found then
    raise exception 'Bonus profile not found';
  end if;

  if exists (
    select 1
    from public.bonus_transactions as bonus_tx
    where bonus_tx.order_id = p_order_id
      and bonus_tx.user_id <> p_user_id
  ) then
    raise exception 'Bonus order belongs to another profile';
  end if;

  select bonus_tx.amount
  into existing_spend
  from public.bonus_transactions as bonus_tx
  where bonus_tx.user_id = p_user_id
    and bonus_tx.order_id = p_order_id
    and bonus_tx.operation = 'spend';

  if existing_spend is null then
    existing_spend := least(
      greatest(current_balance, 0),
      floor((p_eligible_amount::numeric * 10) / 100)::integer
    );

    update public.profiles as profile
    set bonus_balance = profile.bonus_balance - existing_spend
    where profile.id = p_user_id;
    current_balance := current_balance - existing_spend;

    insert into public.bonus_transactions (
      user_id,
      order_id,
      operation,
      amount
    ) values (
      p_user_id,
      p_order_id,
      'spend',
      existing_spend
    );
  end if;

  select greatest(
    0,
    coalesce(max(bonus_tx.amount) filter (
      where bonus_tx.operation = 'earn'
    ), 0) - coalesce(max(bonus_tx.amount) filter (
      where bonus_tx.operation = 'earn_reversal'
    ), 0)
  )
  into current_earned
  from public.bonus_transactions as bonus_tx
  where bonus_tx.user_id = p_user_id
    and bonus_tx.order_id = p_order_id;

  return query
  select existing_spend, current_earned, current_balance;
end;
$bonus_reserve$;

create or replace function public.credit_order_bonus(
  p_user_id uuid,
  p_order_id uuid,
  p_paid_eligible_amount integer
)
returns table (
  bonus_spent integer,
  bonus_earned integer,
  bonus_balance integer
)
language plpgsql
security definer
set search_path = ''
as $bonus_credit$
declare
  current_balance integer;
  current_spend integer;
  current_earned integer;
  reversed_earned integer;
  spend_was_released boolean;
begin
  if p_user_id is null
    or p_order_id is null
    or p_paid_eligible_amount is null
    or p_paid_eligible_amount < 0
  then
    raise exception 'Invalid bonus credit arguments';
  end if;

  select profile.bonus_balance
  into current_balance
  from public.profiles as profile
  where profile.id = p_user_id
  for update;

  if not found then
    raise exception 'Bonus profile not found';
  end if;

  if exists (
    select 1
    from public.bonus_transactions as bonus_tx
    where bonus_tx.order_id = p_order_id
      and bonus_tx.user_id <> p_user_id
  ) then
    raise exception 'Bonus order belongs to another profile';
  end if;

  select bonus_tx.amount
  into current_spend
  from public.bonus_transactions as bonus_tx
  where bonus_tx.user_id = p_user_id
    and bonus_tx.order_id = p_order_id
    and bonus_tx.operation = 'spend';
  current_spend := coalesce(current_spend, 0);

  select bonus_tx.amount
  into reversed_earned
  from public.bonus_transactions as bonus_tx
  where bonus_tx.user_id = p_user_id
    and bonus_tx.order_id = p_order_id
    and bonus_tx.operation = 'earn_reversal';

  select exists (
    select 1
    from public.bonus_transactions as bonus_tx
    where bonus_tx.user_id = p_user_id
      and bonus_tx.order_id = p_order_id
      and bonus_tx.operation = 'spend_release'
  ) into spend_was_released;

  select bonus_tx.amount
  into current_earned
  from public.bonus_transactions as bonus_tx
  where bonus_tx.user_id = p_user_id
    and bonus_tx.order_id = p_order_id
    and bonus_tx.operation = 'earn';

  if current_earned is null
    and reversed_earned is null
    and not spend_was_released
  then
    current_earned := floor(
      (p_paid_eligible_amount::numeric * 5) / 100
    )::integer;

    update public.profiles as profile
    set bonus_balance = profile.bonus_balance + current_earned
    where profile.id = p_user_id;
    current_balance := current_balance + current_earned;

    insert into public.bonus_transactions (
      user_id,
      order_id,
      operation,
      amount
    ) values (
      p_user_id,
      p_order_id,
      'earn',
      current_earned
    );
  end if;

  current_earned := greatest(
    0,
    coalesce(current_earned, 0) - coalesce(reversed_earned, 0)
  );

  return query
  select current_spend, current_earned, current_balance;
end;
$bonus_credit$;

create or replace function public.reverse_order_bonuses(
  p_user_id uuid,
  p_order_id uuid,
  p_reverse_earned boolean default false
)
returns table (
  bonus_spent integer,
  bonus_earned integer,
  bonus_balance integer
)
language plpgsql
security definer
set search_path = ''
as $bonus_reverse$
declare
  current_balance integer;
  current_spend integer;
  released_spend integer;
  current_earned integer;
  reversed_earned integer;
begin
  if p_user_id is null or p_order_id is null then
    raise exception 'Invalid bonus reversal arguments';
  end if;

  select profile.bonus_balance
  into current_balance
  from public.profiles as profile
  where profile.id = p_user_id
  for update;

  if not found then
    raise exception 'Bonus profile not found';
  end if;

  if exists (
    select 1
    from public.bonus_transactions as bonus_tx
    where bonus_tx.order_id = p_order_id
      and bonus_tx.user_id <> p_user_id
  ) then
    raise exception 'Bonus order belongs to another profile';
  end if;

  select bonus_tx.amount
  into current_spend
  from public.bonus_transactions as bonus_tx
  where bonus_tx.user_id = p_user_id
    and bonus_tx.order_id = p_order_id
    and bonus_tx.operation = 'spend';
  current_spend := coalesce(current_spend, 0);

  select bonus_tx.amount
  into released_spend
  from public.bonus_transactions as bonus_tx
  where bonus_tx.user_id = p_user_id
    and bonus_tx.order_id = p_order_id
    and bonus_tx.operation = 'spend_release';

  if released_spend is null then
    update public.profiles as profile
    set bonus_balance = profile.bonus_balance + current_spend
    where profile.id = p_user_id;
    current_balance := current_balance + current_spend;

    insert into public.bonus_transactions (
      user_id,
      order_id,
      operation,
      amount
    ) values (
      p_user_id,
      p_order_id,
      'spend_release',
      current_spend
    );
  end if;

  select bonus_tx.amount
  into current_earned
  from public.bonus_transactions as bonus_tx
  where bonus_tx.user_id = p_user_id
    and bonus_tx.order_id = p_order_id
    and bonus_tx.operation = 'earn';
  current_earned := coalesce(current_earned, 0);

  select bonus_tx.amount
  into reversed_earned
  from public.bonus_transactions as bonus_tx
  where bonus_tx.user_id = p_user_id
    and bonus_tx.order_id = p_order_id
    and bonus_tx.operation = 'earn_reversal';

  if p_reverse_earned and reversed_earned is null then
    reversed_earned := current_earned;

    update public.profiles as profile
    set bonus_balance = profile.bonus_balance - reversed_earned
    where profile.id = p_user_id;
    current_balance := current_balance - reversed_earned;

    insert into public.bonus_transactions (
      user_id,
      order_id,
      operation,
      amount
    ) values (
      p_user_id,
      p_order_id,
      'earn_reversal',
      reversed_earned
    );
  end if;

  return query
  select
    current_spend,
    greatest(0, current_earned - coalesce(reversed_earned, 0)),
    current_balance;
end;
$bonus_reverse$;

revoke all on function public.reserve_order_bonus(uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.credit_order_bonus(uuid, uuid, integer)
  from public, anon, authenticated;
revoke all on function public.reverse_order_bonuses(uuid, uuid, boolean)
  from public, anon, authenticated;

grant execute on function public.reserve_order_bonus(uuid, uuid, integer)
  to service_role;
grant execute on function public.credit_order_bonus(uuid, uuid, integer)
  to service_role;
grant execute on function public.reverse_order_bonuses(uuid, uuid, boolean)
  to service_role;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

drop trigger if exists reminders_set_updated_at on public.reminders;
create trigger reminders_set_updated_at
  before update on public.reminders
  for each row execute function public.set_updated_at();

drop trigger if exists push_subscriptions_set_updated_at
  on public.push_subscriptions;
create trigger push_subscriptions_set_updated_at
  before update on public.push_subscriptions
  for each row execute function public.set_updated_at();

drop trigger if exists notification_logs_set_updated_at
  on public.notification_logs;
create trigger notification_logs_set_updated_at
  before update on public.notification_logs
  for each row execute function public.set_updated_at();

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_name text;
begin
  profile_name := left(
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
      'Покупатель'
    ),
    100
  );

  insert into public.profiles (
    id,
    name,
    bonus_balance,
    welcome_bonus_granted_at
  )
  values (
    new.id,
    profile_name,
    case when new.email_confirmed_at is not null then 1000 else 0 end,
    case when new.email_confirmed_at is not null then now() else null end
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function public.handle_new_user() from public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.grant_welcome_bonus_after_confirmation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.email_confirmed_at is not null
    and old.email_confirmed_at is null
  then
    update public.profiles as profile
    set
      bonus_balance = profile.bonus_balance + 1000,
      welcome_bonus_granted_at = now()
    where profile.id = new.id
      and profile.welcome_bonus_granted_at is null;
  end if;

  return new;
end;
$$;

revoke all on function public.grant_welcome_bonus_after_confirmation()
  from public;

drop trigger if exists on_auth_user_email_confirmed on auth.users;
create trigger on_auth_user_email_confirmed
  after update of email_confirmed_at on auth.users
  for each row execute function public.grant_welcome_bonus_after_confirmation();

create or replace function public.enforce_reminder_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.user_id::text, 7101)
  );

  if (
    select count(*) >= 100
    from public.reminders as reminder
    where reminder.user_id = new.user_id
  ) then
    raise exception 'Reminder quota exceeded'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_reminder_quota() from public;

drop trigger if exists reminders_enforce_quota on public.reminders;
create trigger reminders_enforce_quota
  before insert on public.reminders
  for each row execute function public.enforce_reminder_quota();

create or replace function public.enforce_push_subscription_quota()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.user_id::text, 7102)
  );

  if exists (
    select 1
    from public.push_subscriptions as subscription
    where subscription.user_id = new.user_id
      and subscription.firebase_installation_id = new.firebase_installation_id
  ) then
    return new;
  end if;

  if (
    select count(*) >= 5
    from public.push_subscriptions as subscription
    where subscription.user_id = new.user_id
  ) then
    raise exception 'Push subscription quota exceeded'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

revoke all on function public.enforce_push_subscription_quota() from public;

drop trigger if exists push_subscriptions_enforce_quota
  on public.push_subscriptions;
create trigger push_subscriptions_enforce_quota
  before insert on public.push_subscriptions
  for each row execute function public.enforce_push_subscription_quota();

alter table public.profiles enable row level security;
alter table public.bonus_transactions enable row level security;
alter table public.reminders enable row level security;
alter table public.push_subscriptions enable row level security;
alter table public.notification_logs enable row level security;

-- This file is the policy source of truth. Remove stale permissive policies
-- left by older revisions before recreating the audited allow-list below.
do $drop_legacy_policies$
declare
  policy_row record;
begin
  for policy_row in
    select schemaname, tablename, policyname
    from pg_catalog.pg_policies
    where schemaname = 'public'
      and tablename in (
        'profiles',
        'bonus_transactions',
        'reminders',
        'push_subscriptions',
        'notification_logs'
      )
  loop
    execute format(
      'drop policy if exists %I on %I.%I',
      policy_row.policyname,
      policy_row.schemaname,
      policy_row.tablename
    );
  end loop;
end;
$drop_legacy_policies$;

drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
  on public.profiles
  for select
  to authenticated
  using ((select auth.uid()) = id);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
  on public.profiles
  for update
  to authenticated
  using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists reminders_select_own on public.reminders;
create policy reminders_select_own
  on public.reminders
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists reminders_insert_own on public.reminders;
create policy reminders_insert_own
  on public.reminders
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists reminders_update_own on public.reminders;
create policy reminders_update_own
  on public.reminders
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists reminders_delete_own on public.reminders;
create policy reminders_delete_own
  on public.reminders
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists push_subscriptions_select_own
  on public.push_subscriptions;
create policy push_subscriptions_select_own
  on public.push_subscriptions
  for select
  to authenticated
  using ((select auth.uid()) = user_id);

drop policy if exists push_subscriptions_insert_own
  on public.push_subscriptions;
create policy push_subscriptions_insert_own
  on public.push_subscriptions
  for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

drop policy if exists push_subscriptions_update_own
  on public.push_subscriptions;
create policy push_subscriptions_update_own
  on public.push_subscriptions
  for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists push_subscriptions_delete_own
  on public.push_subscriptions;
create policy push_subscriptions_delete_own
  on public.push_subscriptions
  for delete
  to authenticated
  using ((select auth.uid()) = user_id);

revoke all on table public.profiles from anon, authenticated;
revoke all on table public.bonus_transactions from anon, authenticated;
revoke all on table public.reminders from anon, authenticated;
revoke all on table public.push_subscriptions from anon, authenticated;
revoke all on table public.notification_logs from anon, authenticated;

grant select on table public.profiles to authenticated;
grant update (name) on table public.profiles to authenticated;

grant select, delete on table public.reminders to authenticated;
grant insert (
  user_id,
  title,
  person_name,
  event_type,
  event_day,
  event_month,
  event_year,
  notify_7_days,
  notify_3_days,
  notify_1_day,
  notify_same_day
) on table public.reminders to authenticated;
grant update (
  title,
  person_name,
  event_type,
  event_day,
  event_month,
  event_year,
  notify_7_days,
  notify_3_days,
  notify_1_day,
  notify_same_day
) on table public.reminders to authenticated;

grant select, delete on table public.push_subscriptions to authenticated;
grant insert (
  user_id,
  firebase_installation_id,
  user_agent,
  is_active,
  last_seen_at
) on table public.push_subscriptions to authenticated;
grant update (
  firebase_installation_id,
  user_agent,
  is_active,
  last_seen_at
) on table public.push_subscriptions to authenticated;

grant all on table public.profiles to service_role;
grant all on table public.bonus_transactions to service_role;
grant all on table public.reminders to service_role;
grant all on table public.push_subscriptions to service_role;
grant all on table public.notification_logs to service_role;

commit;
