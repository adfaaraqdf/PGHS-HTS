begin;
select plan(58);

select is((select allowed_school_domain from private.app_config where id), 'pangyo.hs.kr', 'school domain is centralized');
select is((select count(*)::integer from public.clubs), 20, 'official club count is 20');
select is((select count(*)::integer from public.etfs), 6, 'official ETF count is 6');
select is((select count(*)::integer from public.clubs where id in ('리켐','인벨릭스','네온')), 0, 'aliases are not duplicate securities');
select is((select count(*)::integer from public.clubs c join public.etfs e on e.id = c.etf_id), 20, 'every club references one valid ETF');
select is((select sum(cardinality(club_ids))::integer from public.etfs), 20, 'ETF components contain 20 memberships');
select is((select count(distinct current_price)::integer from public.clubs), 1, 'all clubs share one initial price');
select is((select count(distinct issued_shares)::integer from public.clubs), 1, 'all clubs share one issued-share value');

select set_config('request.jwt.claims', '{"role":"anon"}', true);
set local role anon;
select throws_ok(
  $$ select count(*) from public.clubs $$,
  '42501',
  'permission denied for table clubs',
  'anonymous users cannot read market data'
);
reset role;

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated', 'student@pangyo.hs.kr', '', now(),
  '{"provider":"google","providers":["google"]}', '{"full_name":"테스트 학생"}', now(), now()
);

select set_config('request.jwt.claims', '{"sub":"11111111-1111-1111-1111-111111111111","role":"authenticated","email":"student@pangyo.hs.kr"}', true);
set local role authenticated;
select throws_ok(
  $$ select public.initialize_user(null) $$,
  'P0001',
  'nickname-required',
  'first initialization requires a nickname'
);
select throws_ok(
  $$ select public.initialize_user('!') $$,
  'P0001',
  'invalid-nickname',
  'nickname validation runs on the server'
);
select lives_ok($$ select public.initialize_user('테스트학생') $$, 'verified school user initializes');
select is((select cash from public.accounts where id = auth.uid()), 1000000::bigint, 'initial cash is granted once');
select lives_ok($$ select public.initialize_user(null) $$, 'reinitialization is idempotent');
select is((select cash from public.accounts where id = auth.uid()), 1000000::bigint, 'reinitialization does not duplicate cash');

select throws_ok(
  $$ update public.accounts set cash = cash + 1 where id = auth.uid() $$,
  '42501',
  'permission denied for table accounts',
  'client cannot directly change cash'
);
select throws_ok(
  $$ insert into public.holdings(user_id, club_id, quantity, average_buy_price) values (auth.uid(), 'mechanism', 1, 10000) $$,
  '42501',
  'permission denied for table holdings',
  'client cannot directly create holdings'
);
select throws_ok(
  $$ insert into public.trade_history default values $$,
  '42501',
  'permission denied for table trade_history',
  'client cannot forge trade history'
);
select throws_ok(
  $$ update public.clubs set current_price = 1 where id = 'mechanism' $$,
  '42501',
  'permission denied for table clubs',
  'client cannot directly change prices'
);
select throws_ok(
  $$ select count(*) from private.trade_requests $$,
  '42501',
  'permission denied for table trade_requests',
  'client cannot read the private request ledger'
);

reset role;
update public.market_state set status = 'open', opened_at = now();
update public.clubs set price_calculated_at = now();
set local role authenticated;

select lives_ok($$ select public.buy_stock('mechanism', 1, 'test_idempotency_key_0001') $$, 'authenticated buy succeeds');
select lives_ok($$ select public.buy_stock('mechanism', 1, 'test_idempotency_key_0001') $$, 'same request replays safely');
select is((select cash from public.accounts where id = auth.uid()), 990000::bigint, 'duplicate request changes cash once');
select is((select quantity from public.holdings where user_id = auth.uid() and club_id = 'mechanism'), 1::bigint, 'holding changes once');
select throws_ok(
  $$ select public.buy_stock('mechanism', 2, 'test_idempotency_key_0001') $$,
  'P0001',
  'duplicate-request',
  'same key with a different payload is rejected'
);
select throws_ok(
  $$ select public.buy_stock('mechanism', 0, 'test_idempotency_key_0002') $$,
  'P0001',
  'invalid-quantity',
  'zero quantity is rejected'
);
select throws_ok(
  $$ select public.buy_stock('missing-club', 1, 'test_idempotency_key_0003') $$,
  'P0001',
  'club-not-found',
  'unknown club is rejected'
);
select throws_ok(
  $$ select public.buy_stock('mechanism', 1000000, 'test_idempotency_key_0004') $$,
  'P0001',
  'insufficient-funds',
  'oversized purchase cannot make cash negative'
);

reset role;
select is((select count(*)::integer from private.trade_requests), 1, 'one successful request is stored');
select is((select count(*)::integer from public.trade_history), 1, 'one authoritative trade-history row is stored');
select is((select sum(buy_quantity)::bigint from private.market_demand), 1::bigint, 'buy demand is aggregated once');
select is((private.run_price_tick() ->> 'club_count')::integer, 20, 'buy-side price tick processes all official clubs');
select cmp_ok((select current_price from public.clubs where id = 'mechanism'), '>', 10000::bigint, 'buy-side demand moves price upward');

set local role authenticated;
select lives_ok($$ select public.buy_stock('mechanism', 1, 'test_idempotency_key_0005') $$, 'second buy uses the new server price');
select is((select average_buy_price from public.holdings where user_id = auth.uid() and club_id = 'mechanism'), 10001::bigint, 'weighted average uses integer half-up rounding');
select is((select quantity from public.holdings where user_id = auth.uid() and club_id = 'mechanism'), 2::bigint, 'second buy increases quantity');
select lives_ok($$ select public.sell_stock('mechanism', 1, 'test_idempotency_key_0006') $$, 'partial sell succeeds');
select is((select quantity from public.holdings where user_id = auth.uid() and club_id = 'mechanism'), 1::bigint, 'partial sell keeps remaining quantity');
select is((select average_buy_price from public.holdings where user_id = auth.uid() and club_id = 'mechanism'), 10001::bigint, 'partial sell keeps the previous average');
select lives_ok($$ select public.sell_stock('mechanism', 1, 'test_idempotency_key_0007') $$, 'full sell succeeds');
select is((select cash from public.accounts where id = auth.uid()), 1000001::bigint, 'sell proceeds are calculated from server prices');
select is((select count(*)::integer from public.holdings where user_id = auth.uid() and club_id = 'mechanism'), 0, 'full sell deletes the holding row');

reset role;
select is((select count(*)::integer from private.trade_requests), 4, 'four unique successful requests are stored');
select is((select count(*)::integer from public.trade_history), 4, 'four authoritative trades are stored');
select is(
  (select coalesce(sum(buy_quantity), 0)::text || ':' || coalesce(sum(sell_quantity), 0)::text
   from private.market_demand
   where window_id = (select active_demand_window_id from public.market_state where id = 'current')),
  '1:2',
  'the active window contains one buy and two sells'
);
select is((private.run_price_tick() ->> 'club_count')::integer, 20, 'sell-side price tick processes all official clubs');
select cmp_ok((select current_price from public.clubs where id = 'mechanism'), '<', 10001::bigint, 'sell-side demand moves price downward');
select is((private.run_price_tick() ->> 'club_count')::integer, 20, 'no-demand price tick still completes safely');
select is((select current_price from public.clubs where id = 'mechanism'), 10000::bigint, 'no-demand tick does not create price oscillation');

update public.market_state set status = 'closed', closed_at = now();
set local role authenticated;
select throws_ok(
  $$ select public.buy_stock('mechanism', 1, 'test_idempotency_key_0008') $$,
  'P0001',
  'market-closed',
  'closed market rejects a new trade'
);
reset role;
update public.accounts set account_status = 'disabled' where id = '11111111-1111-1111-1111-111111111111';
set local role authenticated;
select throws_ok(
  $$ select public.initialize_user(null) $$,
  'P0001',
  'account-disabled',
  'disabled account cannot initialize again'
);
reset role;
update public.accounts set account_status = 'active' where id = '11111111-1111-1111-1111-111111111111';

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '22222222-2222-2222-2222-222222222222',
  'authenticated', 'authenticated', 'outsider@example.com', '', now(),
  '{"provider":"google","providers":["google"]}', '{"full_name":"외부 사용자"}', now(), now()
);
insert into public.accounts(
  id, display_name, nickname, cash, estimated_total_asset, account_status
) values (
  '22222222-2222-2222-2222-222222222222', '외부 사용자', '외부학생', 1000000, 1000000, 'active'
);
select set_config('request.jwt.claims', '{"sub":"22222222-2222-2222-2222-222222222222","role":"authenticated","email":"outsider@example.com"}', true);
set local role authenticated;
select is((select count(*)::integer from public.clubs), 0, 'outside-domain user cannot read market data');
select is((select count(*)::integer from public.accounts), 0, 'outside-domain user cannot read even its injected account');
select throws_ok(
  $$ select public.initialize_user('외부학생') $$,
  'P0001',
  'school-account-required',
  'outside-domain user cannot initialize through RPC'
);
reset role;

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '33333333-3333-3333-3333-333333333333',
  'authenticated', 'authenticated', 'unverified@pangyo.hs.kr', '', null,
  '{"provider":"google","providers":["google"]}', '{}', now(), now()
);
select set_config('request.jwt.claims', '{"sub":"33333333-3333-3333-3333-333333333333","role":"authenticated","email":"unverified@pangyo.hs.kr"}', true);
set local role authenticated;
select throws_ok(
  $$ select public.initialize_user('미인증학생') $$,
  'P0001',
  'email-not-verified',
  'unverified school email cannot initialize'
);
reset role;

insert into auth.users(
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
) values (
  '00000000-0000-0000-0000-000000000000',
  '44444444-4444-4444-4444-444444444444',
  'authenticated', 'authenticated', 'password@pangyo.hs.kr', '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);
select set_config('request.jwt.claims', '{"sub":"44444444-4444-4444-4444-444444444444","role":"authenticated","email":"password@pangyo.hs.kr"}', true);
set local role authenticated;
select throws_ok(
  $$ select public.initialize_user('일반로그인') $$,
  'P0001',
  'school-account-required',
  'non-Google provider cannot initialize'
);
reset role;

select is((select count(*)::integer from cron.job where jobname = 'pghs-price-tick' and schedule = '* * * * *'), 1, 'one price cron job is scheduled every minute');
select is((select count(*)::integer from pg_publication_tables where pubname = 'supabase_realtime'), 6, 'Realtime publication contains six bounded public tables');

select * from finish();
rollback;
