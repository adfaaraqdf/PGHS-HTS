create or replace function private.current_verified_user()
returns auth.users
language plpgsql
security definer
stable
set search_path = ''
as $$
declare
  v_user auth.users;
  v_domain text;
begin
  if (select auth.uid()) is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;

  select * into v_user from auth.users where id = (select auth.uid());
  if v_user.id is null then
    raise exception using errcode = 'P0001', message = 'unauthenticated';
  end if;
  if v_user.email_confirmed_at is null then
    raise exception using errcode = 'P0001', message = 'email-not-verified';
  end if;
  if coalesce(v_user.raw_app_meta_data ->> 'provider', '') <> 'google' then
    raise exception using errcode = 'P0001', message = 'school-account-required';
  end if;

  select allowed_school_domain into v_domain from private.app_config where id = true;
  if v_domain is null or v_user.email is null or lower(split_part(v_user.email, '@', 2)) <> v_domain then
    raise exception using errcode = 'P0001', message = 'school-account-required';
  end if;
  return v_user;
end;
$$;

revoke all on function private.current_verified_user() from public, anon, authenticated;

create or replace function public.initialize_user(p_nickname text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth auth.users;
  v_account public.accounts;
  v_config private.app_config;
  v_nickname text := nullif(btrim(p_nickname), '');
  v_display_name text;
begin
  v_auth := private.current_verified_user();
  perform pg_advisory_xact_lock(hashtext(v_auth.id::text));

  select * into v_config from private.app_config where id = true;
  select * into v_account from public.accounts where id = v_auth.id for update;

  if v_account.id is not null then
    if v_account.account_status <> 'active' then
      raise exception using errcode = 'P0001', message = 'account-disabled';
    end if;
    update public.accounts set last_login_at = now(), updated_at = now() where id = v_auth.id
      returning * into v_account;
  else
    if v_nickname is null then
      raise exception using errcode = 'P0001', message = 'nickname-required';
    end if;
    if char_length(v_nickname) not between 2 and 16
      or v_nickname !~ '^[가-힣A-Za-z0-9 ]+$'
      or exists (select 1 from unnest(v_config.nickname_forbidden_words) word where lower(v_nickname) like '%' || lower(word) || '%') then
      raise exception using errcode = 'P0001', message = 'invalid-nickname';
    end if;

    v_display_name := coalesce(
      nullif(v_auth.raw_user_meta_data ->> 'full_name', ''),
      nullif(v_auth.raw_user_meta_data ->> 'name', ''),
      split_part(v_auth.email, '@', 1)
    );
    insert into public.accounts (
      id, display_name, nickname, cash, estimated_total_asset,
      account_status, initial_grant_applied
    ) values (
      v_auth.id, v_display_name, v_nickname, v_config.initial_cash,
      v_config.initial_cash, 'active', true
    ) returning * into v_account;

    insert into public.public_profiles(user_id, nickname, account_status)
      values (v_auth.id, v_nickname, 'active');
  end if;

  return jsonb_build_object(
    'uid', v_account.id,
    'nickname', v_account.nickname,
    'cash', v_account.cash,
    'estimatedTotalAsset', v_account.estimated_total_asset,
    'accountStatus', v_account.account_status
  );
end;
$$;

revoke all on function public.initialize_user(text) from public, anon;
grant execute on function public.initialize_user(text) to authenticated;

create or replace function private.execute_trade(
  p_side text,
  p_club_id text,
  p_quantity bigint,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_auth auth.users;
  v_account public.accounts;
  v_market public.market_state;
  v_config public.market_config;
  v_club public.clubs;
  v_holding public.holdings;
  v_existing private.trade_requests;
  v_old_quantity bigint := 0;
  v_old_average bigint;
  v_new_quantity bigint;
  v_new_average bigint;
  v_cash_after bigint;
  v_gross bigint;
  v_trade_id uuid := extensions.gen_random_uuid();
  v_idempotency_digest text;
  v_payload_digest text;
  v_request_id text;
  v_shard integer;
  v_result jsonb;
begin
  v_auth := private.current_verified_user();
  if p_side not in ('buy', 'sell') then
    raise exception using errcode = 'P0001', message = 'invalid-side';
  end if;
  if p_quantity is null or p_quantity <= 0 or p_quantity > 1000000 then
    raise exception using errcode = 'P0001', message = 'invalid-quantity';
  end if;
  if p_club_id is null or p_club_id !~ '^[a-z0-9]+(?:-[a-z0-9]+)*$' then
    raise exception using errcode = 'P0001', message = 'club-not-found';
  end if;
  if p_idempotency_key is null or char_length(p_idempotency_key) not between 16 and 128
    or p_idempotency_key !~ '^[A-Za-z0-9_-]+$' then
    raise exception using errcode = 'P0001', message = 'invalid-idempotency-key';
  end if;

  v_idempotency_digest := encode(extensions.digest(v_auth.id::text || chr(31) || p_idempotency_key, 'sha256'), 'hex');
  v_payload_digest := encode(extensions.digest(p_side || chr(31) || p_club_id || chr(31) || p_quantity::text, 'sha256'), 'hex');
  v_request_id := encode(extensions.digest('trade:v1' || chr(31) || v_auth.id::text || chr(31) || p_idempotency_key, 'sha256'), 'hex');

  select * into v_account from public.accounts where id = v_auth.id for update;
  if v_account.id is null then
    raise exception using errcode = 'P0001', message = 'permission-denied';
  end if;
  if v_account.account_status <> 'active' then
    raise exception using errcode = 'P0001', message = 'account-disabled';
  end if;

  select * into v_existing from private.trade_requests
    where user_id = v_auth.id and idempotency_digest = v_idempotency_digest;
  if v_existing.request_id is not null then
    if v_existing.payload_digest <> v_payload_digest then
      raise exception using errcode = 'P0001', message = 'duplicate-request';
    end if;
    return v_existing.result;
  end if;

  select * into v_market from public.market_state where id = 'current' for update;
  if v_market.status <> 'open' then
    raise exception using errcode = 'P0001', message = 'market-closed';
  end if;
  select * into v_config from public.market_config where id = 'current';
  select * into v_club from public.clubs where id = p_club_id for update;
  if v_club.id is null or not v_club.is_active then
    raise exception using errcode = 'P0001', message = 'club-not-found';
  end if;
  if v_club.trading_status <> 'open' then
    raise exception using errcode = 'P0001', message = 'trading-halted';
  end if;
  if v_club.price_calculated_at is null
    or v_club.price_calculated_at < now() - make_interval(secs => v_config.max_price_age_seconds) then
    raise exception using errcode = 'P0001', message = 'price-stale';
  end if;

  select * into v_holding from public.holdings
    where user_id = v_auth.id and club_id = p_club_id for update;
  if v_holding.user_id is not null then
    v_old_quantity := v_holding.quantity;
    v_old_average := v_holding.average_buy_price;
  end if;

  v_gross := v_club.current_price * p_quantity;
  if p_side = 'buy' then
    if v_account.cash < v_gross then
      raise exception using errcode = 'P0001', message = 'insufficient-funds';
    end if;
    v_new_quantity := v_old_quantity + p_quantity;
    v_new_average := ((v_old_quantity * coalesce(v_old_average, 0)) + v_gross + (v_new_quantity / 2)) / v_new_quantity;
    v_cash_after := v_account.cash - v_gross;
    insert into public.holdings(user_id, club_id, quantity, average_buy_price)
      values (v_auth.id, p_club_id, v_new_quantity, v_new_average)
      on conflict (user_id, club_id) do update set
        quantity = excluded.quantity,
        average_buy_price = excluded.average_buy_price,
        updated_at = now();
  else
    if v_old_quantity < p_quantity then
      raise exception using errcode = 'P0001', message = 'insufficient-holdings';
    end if;
    v_new_quantity := v_old_quantity - p_quantity;
    v_new_average := case when v_new_quantity = 0 then null else v_old_average end;
    v_cash_after := v_account.cash + v_gross;
    if v_new_quantity = 0 then
      delete from public.holdings where user_id = v_auth.id and club_id = p_club_id;
    else
      update public.holdings set quantity = v_new_quantity, updated_at = now()
        where user_id = v_auth.id and club_id = p_club_id;
    end if;
  end if;

  update public.accounts set cash = v_cash_after, updated_at = now() where id = v_auth.id;
  v_shard := get_byte(extensions.digest(v_request_id, 'sha256'), 0) % v_config.demand_shard_count;

  insert into private.market_demand(
    club_id, window_id, shard_id, buy_quantity, sell_quantity,
    buy_trade_count, sell_trade_count, gross_buy_amount, gross_sell_amount
  ) values (
    p_club_id, v_market.active_demand_window_id, v_shard,
    case when p_side = 'buy' then p_quantity else 0 end,
    case when p_side = 'sell' then p_quantity else 0 end,
    case when p_side = 'buy' then 1 else 0 end,
    case when p_side = 'sell' then 1 else 0 end,
    case when p_side = 'buy' then v_gross else 0 end,
    case when p_side = 'sell' then v_gross else 0 end
  ) on conflict (club_id, window_id, shard_id) do update set
    buy_quantity = private.market_demand.buy_quantity + excluded.buy_quantity,
    sell_quantity = private.market_demand.sell_quantity + excluded.sell_quantity,
    buy_trade_count = private.market_demand.buy_trade_count + excluded.buy_trade_count,
    sell_trade_count = private.market_demand.sell_trade_count + excluded.sell_trade_count,
    gross_buy_amount = private.market_demand.gross_buy_amount + excluded.gross_buy_amount,
    gross_sell_amount = private.market_demand.gross_sell_amount + excluded.gross_sell_amount,
    updated_at = now();

  v_result := jsonb_build_object(
    'trade_id', v_trade_id,
    'club_id', p_club_id,
    'side', p_side,
    'quantity', p_quantity,
    'execution_price', v_club.current_price,
    'gross_amount', v_gross,
    'cash_after', v_cash_after,
    'holding_quantity_after', v_new_quantity,
    'average_buy_price_after', v_new_average
  );

  insert into public.trade_history(
    id, user_id, club_id, side, quantity, execution_price, gross_amount,
    cash_after, holding_quantity_after, average_buy_price_after
  ) values (
    v_trade_id, v_auth.id, p_club_id, p_side, p_quantity, v_club.current_price,
    v_gross, v_cash_after, v_new_quantity, v_new_average
  );
  insert into private.trades values (
    v_trade_id, v_auth.id, p_club_id, p_side, p_quantity, v_club.current_price,
    v_gross, v_idempotency_digest, v_account.cash, v_cash_after, v_old_quantity,
    v_new_quantity, v_old_average, v_new_average, v_market.active_demand_window_id,
    v_shard, now()
  );
  insert into private.trade_requests(
    request_id, user_id, idempotency_digest, payload_digest, side, club_id,
    quantity, status, trade_id, result
  ) values (
    v_request_id, v_auth.id, v_idempotency_digest, v_payload_digest, p_side,
    p_club_id, p_quantity, 'succeeded', v_trade_id, v_result
  );

  return v_result;
end;
$$;

revoke all on function private.execute_trade(text, text, bigint, text) from public, anon, authenticated;

create or replace function public.buy_stock(p_club_id text, p_quantity bigint, p_idempotency_key text)
returns jsonb language sql security definer set search_path = ''
as $$ select private.execute_trade('buy', p_club_id, p_quantity, p_idempotency_key); $$;

create or replace function public.sell_stock(p_club_id text, p_quantity bigint, p_idempotency_key text)
returns jsonb language sql security definer set search_path = ''
as $$ select private.execute_trade('sell', p_club_id, p_quantity, p_idempotency_key); $$;

revoke all on function public.buy_stock(text, bigint, text) from public, anon;
revoke all on function public.sell_stock(text, bigint, text) from public, anon;
grant execute on function public.buy_stock(text, bigint, text) to authenticated;
grant execute on function public.sell_stock(text, bigint, text) to authenticated;

create or replace function private.run_price_tick()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state public.market_state;
  v_config public.market_config;
  v_club public.clubs;
  v_buy bigint;
  v_sell bigint;
  v_demand_bps integer;
  v_rating_bps integer;
  v_event_bps integer;
  v_total_bps integer;
  v_new_price bigint;
  v_delta bigint;
  v_window text;
  v_next_window text;
  v_processed integer := 0;
begin
  if not pg_try_advisory_xact_lock(hashtext('pghs-price-tick')) then
    return jsonb_build_object('status', 'locked');
  end if;

  select * into v_state from public.market_state where id = 'current' for update;
  if v_state.status <> 'open' then
    return jsonb_build_object('status', 'market-closed');
  end if;
  select * into v_config from public.market_config where id = 'current';
  v_window := v_state.active_demand_window_id;
  v_next_window := to_char(clock_timestamp(), 'YYYYMMDDHH24MISS') || '-' || encode(extensions.gen_random_bytes(4), 'hex');

  for v_club in select * from public.clubs where is_active order by id for update loop
    select coalesce(sum(buy_quantity), 0), coalesce(sum(sell_quantity), 0)
      into v_buy, v_sell
      from private.market_demand
      where club_id = v_club.id and window_id = v_window;

    v_demand_bps := round(
      ((v_buy - v_sell)::numeric * v_config.demand_impact_bps)
      / greatest(v_buy + v_sell + v_config.liquidity_floor, 1)
    );
    v_rating_bps := round(
      (((v_club.average_rating * 1000 - 3000) * v_club.rating_count)
      / greatest(v_club.rating_count + v_config.rating_prior_count, 1))
      * v_config.rating_impact_bps / 2000
    );
    select coalesce(sum(case when impact_type = 'positive' then impact_bps else -impact_bps end), 0)
      into v_event_bps
      from public.admin_events
      where status = 'active' and starts_at <= now() and ends_at > now()
        and v_club.id = any(target_club_ids);

    v_total_bps := greatest(-v_config.max_tick_bps, least(v_config.max_tick_bps,
      v_demand_bps + v_rating_bps + v_event_bps));
    if v_buy + v_sell = 0 and v_rating_bps = 0 and v_event_bps = 0 then
      v_total_bps := 0;
    end if;
    v_delta := round(v_club.current_price::numeric * v_total_bps / 10000);
    v_new_price := greatest(v_config.min_price, least(v_config.max_price, v_club.current_price + v_delta));

    insert into private.price_runs(
      window_id, club_id, old_price, new_price, demand_bps, rating_bps,
      event_bps, input
    ) values (
      v_window, v_club.id, v_club.current_price, v_new_price, v_demand_bps,
      v_rating_bps, v_event_bps,
      jsonb_build_object('buy_quantity', v_buy, 'sell_quantity', v_sell, 'config_version', v_config.version)
    ) on conflict (window_id, club_id) do nothing;

    update public.clubs set
      fundamental_price = greatest(v_config.min_price, least(v_config.max_price,
        fundamental_price + round(fundamental_price::numeric * v_demand_bps / 10000))),
      current_price = v_new_price,
      price_change = v_new_price - previous_close,
      price_change_rate = round(((v_new_price - previous_close)::numeric * 100) / previous_close, 4),
      market_cap = v_new_price * issued_shares,
      buy_volume = v_buy,
      sell_volume = v_sell,
      total_volume = v_buy + v_sell,
      price_calculated_at = now(),
      updated_at = now()
    where id = v_club.id;

    insert into public.price_history(club_id, window_id, price, calculated_at)
      values (v_club.id, v_window, v_new_price, now())
      on conflict (club_id, window_id) do nothing;
    delete from public.price_history
      where club_id = v_club.id and window_id in (
        select window_id from public.price_history where club_id = v_club.id
        order by calculated_at desc offset v_config.history_limit
      );
    v_processed := v_processed + 1;
  end loop;

  update public.market_state set
    active_demand_window_id = v_next_window,
    current_price_window_id = v_window,
    updated_at = now()
  where id = 'current';

  return jsonb_build_object('status', 'published', 'window_id', v_window, 'club_count', v_processed);
end;
$$;

revoke all on function private.run_price_tick() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    begin
      alter publication supabase_realtime add table public.accounts;
      alter publication supabase_realtime add table public.holdings;
      alter publication supabase_realtime add table public.clubs;
      alter publication supabase_realtime add table public.ratings;
      alter publication supabase_realtime add table public.news;
      alter publication supabase_realtime add table public.market_state;
    exception when duplicate_object then null;
    end;
  end if;
end;
$$;
