create extension if not exists pgcrypto with schema extensions;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

alter default privileges for role postgres in schema public
  revoke select, insert, update, delete on tables from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke usage, select on sequences from anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

create table private.app_config (
  id boolean primary key default true check (id),
  allowed_school_domain text not null check (allowed_school_domain = lower(allowed_school_domain)),
  festival_timezone text not null,
  initial_cash bigint not null check (initial_cash > 0),
  nickname_forbidden_words text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table public.accounts (
  id uuid primary key references auth.users(id) on delete restrict,
  display_name text not null,
  nickname text not null check (char_length(nickname) between 2 and 16),
  cash bigint not null check (cash >= 0),
  estimated_total_asset bigint not null check (estimated_total_asset >= 0),
  account_status text not null check (account_status in ('active', 'disabled')),
  initial_grant_applied boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_login_at timestamptz not null default now()
);

create table public.public_profiles (
  user_id uuid primary key references public.accounts(id) on delete cascade,
  nickname text not null,
  account_status text not null check (account_status in ('active', 'disabled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.clubs (
  id text primary key check (id ~ '^[a-z0-9]+(?:-[a-z0-9]+)*$'),
  display_name text not null,
  aliases text[] not null default '{}',
  category text not null,
  description text not null,
  etf_id text not null,
  logo_url text,
  image_url text,
  booth_location text,
  operating_hours text,
  is_active boolean not null default true,
  trading_status text not null check (trading_status in ('open', 'halted', 'closed')),
  current_price bigint not null check (current_price > 0),
  fundamental_price bigint not null check (fundamental_price > 0),
  previous_close bigint not null check (previous_close > 0),
  price_change bigint not null default 0,
  price_change_rate numeric(9, 4) not null default 0,
  issued_shares bigint not null check (issued_shares > 0),
  market_cap bigint not null check (market_cap >= 0),
  buy_volume bigint not null default 0 check (buy_volume >= 0),
  sell_volume bigint not null default 0 check (sell_volume >= 0),
  total_volume bigint not null default 0 check (total_volume >= 0),
  average_rating numeric(3, 2) not null default 3.0 check (average_rating between 1 and 5),
  rating_count bigint not null default 0 check (rating_count >= 0),
  rating_recent_delta numeric(4, 2) not null default 0,
  price_calculated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.etfs (
  id text primary key,
  display_name text not null,
  description text not null,
  club_ids text[] not null check (cardinality(club_ids) > 0),
  current_value bigint not null check (current_value > 0),
  previous_close bigint not null check (previous_close > 0),
  value_change bigint not null default 0,
  value_change_rate numeric(9, 4) not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.clubs
  add constraint clubs_etf_id_fkey foreign key (etf_id) references public.etfs(id) deferrable initially deferred;

create table public.holdings (
  user_id uuid not null references public.accounts(id) on delete cascade,
  club_id text not null references public.clubs(id) on delete restrict,
  quantity bigint not null check (quantity > 0),
  average_buy_price bigint not null check (average_buy_price > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, club_id)
);

create table public.trade_history (
  id uuid primary key,
  user_id uuid not null references public.accounts(id) on delete restrict,
  club_id text not null references public.clubs(id) on delete restrict,
  side text not null check (side in ('buy', 'sell')),
  quantity bigint not null check (quantity > 0),
  execution_price bigint not null check (execution_price > 0),
  gross_amount bigint not null check (gross_amount > 0),
  cash_after bigint not null check (cash_after >= 0),
  holding_quantity_after bigint not null check (holding_quantity_after >= 0),
  average_buy_price_after bigint,
  executed_at timestamptz not null default now()
);

create index trade_history_user_executed_idx on public.trade_history(user_id, executed_at desc, id desc);

create table public.ratings (
  club_id text primary key references public.clubs(id) on delete cascade,
  average_rating numeric(3, 2) not null default 3.0 check (average_rating between 1 and 5),
  average_rating_milli integer not null default 3000 check (average_rating_milli between 1000 and 5000),
  rating_count bigint not null default 0 check (rating_count >= 0),
  rating_recent_delta numeric(4, 2) not null default 0,
  rating_recent_delta_milli integer not null default 0,
  source_updated_at timestamptz,
  ingested_at timestamptz not null default now()
);

create table public.news (
  id uuid primary key default gen_random_uuid(),
  scope text not null check (scope in ('global', 'club')),
  club_id text references public.clubs(id) on delete restrict,
  title text not null check (char_length(title) between 1 and 120),
  body text not null check (char_length(body) between 1 and 4000),
  is_breaking boolean not null default false,
  is_published boolean not null default false,
  published_at timestamptz not null,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((scope = 'global' and club_id is null) or (scope = 'club' and club_id is not null)),
  check (expires_at is null or expires_at > published_at)
);

create index news_published_idx on public.news(is_published, published_at desc);
create index news_club_published_idx on public.news(club_id, is_published, published_at desc);

create table public.admin_events (
  id uuid primary key default gen_random_uuid(),
  impact_type text not null check (impact_type in ('positive', 'negative')),
  target_club_ids text[] not null check (cardinality(target_club_ids) between 1 and 20),
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  impact_bps integer not null check (impact_bps between 0 and 500),
  status text not null check (status in ('scheduled', 'active', 'expired', 'cancelled')),
  reason text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (starts_at < ends_at)
);

create table public.market_config (
  id text primary key check (id = 'current'),
  version integer not null check (version > 0),
  initial_price bigint not null check (initial_price > 0),
  issued_shares bigint not null check (issued_shares > 0),
  min_price bigint not null check (min_price > 0),
  max_price bigint not null check (max_price > min_price),
  max_tick_bps integer not null check (max_tick_bps between 1 and 2000),
  max_price_age_seconds integer not null check (max_price_age_seconds between 30 and 600),
  demand_impact_bps integer not null check (demand_impact_bps between 0 and 2000),
  rating_impact_bps integer not null check (rating_impact_bps between 0 and 1000),
  rating_prior_count integer not null check (rating_prior_count > 0),
  liquidity_floor bigint not null check (liquidity_floor > 0),
  demand_shard_count integer not null check (demand_shard_count between 1 and 50),
  history_limit integer not null check (history_limit between 1 and 120),
  updated_at timestamptz not null default now()
);

create table public.market_state (
  id text primary key check (id = 'current'),
  status text not null check (status in ('open', 'halted', 'closed')),
  active_demand_window_id text not null,
  current_price_window_id text,
  opened_at timestamptz,
  closed_at timestamptz,
  updated_at timestamptz not null default now()
);

create table public.price_history (
  club_id text not null references public.clubs(id) on delete cascade,
  window_id text not null,
  price bigint not null check (price > 0),
  calculated_at timestamptz not null,
  primary key (club_id, window_id)
);
create index price_history_recent_idx on public.price_history(club_id, calculated_at desc);

create table public.public_leaderboard (
  id text primary key check (id = 'current'),
  entries jsonb not null default '[]'::jsonb check (jsonb_typeof(entries) = 'array'),
  updated_at timestamptz not null default now(),
  valuation_version text,
  is_final boolean not null default false
);

create table private.trades (
  id uuid primary key,
  user_id uuid not null,
  club_id text not null,
  side text not null,
  quantity bigint not null,
  execution_price bigint not null,
  gross_amount bigint not null,
  idempotency_digest text not null,
  cash_before bigint not null,
  cash_after bigint not null,
  holding_quantity_before bigint not null,
  holding_quantity_after bigint not null,
  average_buy_price_before bigint,
  average_buy_price_after bigint,
  demand_window_id text not null,
  shard_id integer not null,
  executed_at timestamptz not null default now()
);

create table private.trade_requests (
  request_id text primary key,
  user_id uuid not null,
  idempotency_digest text not null,
  payload_digest text not null,
  side text not null,
  club_id text not null,
  quantity bigint not null,
  status text not null check (status = 'succeeded'),
  trade_id uuid not null,
  result jsonb not null,
  created_at timestamptz not null default now(),
  completed_at timestamptz not null default now(),
  unique (user_id, idempotency_digest)
);

create table private.market_demand (
  club_id text not null,
  window_id text not null,
  shard_id integer not null,
  buy_quantity bigint not null default 0 check (buy_quantity >= 0),
  sell_quantity bigint not null default 0 check (sell_quantity >= 0),
  buy_trade_count bigint not null default 0 check (buy_trade_count >= 0),
  sell_trade_count bigint not null default 0 check (sell_trade_count >= 0),
  gross_buy_amount bigint not null default 0 check (gross_buy_amount >= 0),
  gross_sell_amount bigint not null default 0 check (gross_sell_amount >= 0),
  updated_at timestamptz not null default now(),
  primary key (club_id, window_id, shard_id)
);

create table private.price_runs (
  window_id text not null,
  club_id text not null,
  old_price bigint not null,
  new_price bigint not null,
  demand_bps integer not null,
  rating_bps integer not null,
  event_bps integer not null,
  input jsonb not null,
  calculated_at timestamptz not null default now(),
  primary key (window_id, club_id)
);

create table private.audit_logs (
  id bigint generated always as identity primary key,
  action text not null,
  actor_id uuid,
  target_type text not null,
  target_id text not null,
  correlation_id text not null,
  change_summary jsonb,
  created_at timestamptz not null default now()
);

create table private.leaderboard_entries (
  user_id uuid primary key,
  nickname text not null,
  estimated_total_asset bigint not null,
  rank integer,
  valuation_version text,
  calculated_at timestamptz not null default now()
);

create index accounts_status_idx on public.accounts(id, account_status);
create index holdings_user_idx on public.holdings(user_id);
create index clubs_price_idx on public.clubs(is_active, current_price desc);
create index clubs_change_idx on public.clubs(is_active, price_change_rate desc);
create index clubs_volume_idx on public.clubs(is_active, total_volume desc);

create or replace function private.is_active_user(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1
    from public.accounts a
    join auth.users u on u.id = a.id
    join private.app_config c on c.id = true
    where p_user_id = (select auth.uid())
      and a.id = p_user_id
      and a.account_status = 'active'
      and u.email_confirmed_at is not null
      and coalesce(u.raw_app_meta_data ->> 'provider', '') = 'google'
      and u.email is not null
      and lower(split_part(u.email, '@', 2)) = c.allowed_school_domain
  );
$$;

revoke all on function private.is_active_user(uuid) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.is_active_user(uuid) to authenticated;

alter table public.accounts enable row level security;
alter table public.public_profiles enable row level security;
alter table public.clubs enable row level security;
alter table public.etfs enable row level security;
alter table public.holdings enable row level security;
alter table public.trade_history enable row level security;
alter table public.ratings enable row level security;
alter table public.news enable row level security;
alter table public.admin_events enable row level security;
alter table public.market_config enable row level security;
alter table public.market_state enable row level security;
alter table public.price_history enable row level security;
alter table public.public_leaderboard enable row level security;

create policy accounts_select_self on public.accounts for select to authenticated
  using ((select auth.uid()) = id and private.is_active_user((select auth.uid())));
create policy holdings_select_self on public.holdings for select to authenticated
  using ((select auth.uid()) = user_id and private.is_active_user((select auth.uid())));
create policy trade_history_select_self on public.trade_history for select to authenticated
  using ((select auth.uid()) = user_id and private.is_active_user((select auth.uid())));

create policy public_profiles_no_direct_access on public.public_profiles for select to authenticated using (false);

create policy clubs_select_active_user on public.clubs for select to authenticated
  using (private.is_active_user((select auth.uid())));
create policy etfs_select_active_user on public.etfs for select to authenticated
  using (private.is_active_user((select auth.uid())));
create policy ratings_select_active_user on public.ratings for select to authenticated
  using (private.is_active_user((select auth.uid())));
create policy market_config_select_active_user on public.market_config for select to authenticated
  using (private.is_active_user((select auth.uid())));
create policy market_state_select_active_user on public.market_state for select to authenticated
  using (private.is_active_user((select auth.uid())));
create policy price_history_select_active_user on public.price_history for select to authenticated
  using (private.is_active_user((select auth.uid())));
create policy leaderboard_select_active_user on public.public_leaderboard for select to authenticated
  using (private.is_active_user((select auth.uid())));
create policy news_select_current on public.news for select to authenticated
  using (
    private.is_active_user((select auth.uid()))
    and is_published
    and published_at <= now()
    and (expires_at is null or expires_at > now())
  );
create policy admin_events_select_active on public.admin_events for select to authenticated
  using (
    private.is_active_user((select auth.uid()))
    and status = 'active'
    and starts_at <= now()
    and ends_at > now()
  );

grant usage on schema public to authenticated;
grant select on public.accounts, public.clubs, public.etfs, public.holdings,
  public.trade_history, public.ratings, public.news, public.admin_events,
  public.market_config, public.market_state, public.price_history,
  public.public_leaderboard to authenticated;
revoke all on all tables in schema private from public, anon, authenticated;
revoke insert, update, delete on all tables in schema public from anon, authenticated;
