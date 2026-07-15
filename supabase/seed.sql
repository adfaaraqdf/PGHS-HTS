insert into private.app_config(
  id, allowed_school_domain, festival_timezone, initial_cash, nickname_forbidden_words
) values (true, 'pangyo.hs.kr', 'Asia/Seoul', 1000000, '{}')
on conflict (id) do nothing;

insert into public.market_config(
  id, version, initial_price, issued_shares, min_price, max_price,
  max_tick_bps, max_price_age_seconds, demand_impact_bps, rating_impact_bps,
  rating_prior_count, liquidity_floor, demand_shard_count, history_limit
) values ('current', 1, 10000, 100000, 100, 1000000, 200, 120, 120, 50, 20, 100, 10, 60)
on conflict (id) do nothing;

insert into public.market_state(id, status, active_demand_window_id)
values ('current', 'closed', 'seed-window-0001')
on conflict (id) do nothing;

insert into public.etfs(id, display_name, description, club_ids, current_value, previous_close) values
('etf-tech-engineering', 'IT·공학 ETF', 'IT와 공학 분야 동아리 동일 가중 지수', array['mechanism','invelix','architecture','dynamics'], 10000, 10000),
('etf-natural-science', '자연과학 ETF', '자연과학 분야 동아리 동일 가중 지수', array['rechem','mercury','chemist'], 10000, 10000),
('etf-culture-media', '문화예술·미디어 ETF', '문화예술과 미디어 분야 동아리 동일 가중 지수', array['neon','art-canvas','moment','broadcasting'], 10000, 10000),
('etf-humanities-social', '인문사회·교육 ETF', '인문사회와 교육 분야 동아리 동일 가중 지수', array['geulbitnuri','insight','paradigm','teachist','world-scope','heartbeat'], 10000, 10000),
('etf-business-startup', '경영·창업 ETF', '경영과 창업 분야 동아리 동일 가중 지수', array['startup-patent-lab','reve'], 10000, 10000),
('etf-sports', '스포츠 ETF', '체육 분야 동아리 동일 가중 지수', array['volleyball-love'], 10000, 10000)
on conflict (id) do nothing;

insert into public.clubs(
  id, display_name, aliases, category, description, etf_id,
  is_active, trading_status, current_price, fundamental_price, previous_close,
  issued_shares, market_cap, price_calculated_at
) values
('geulbitnuri','글빛누리','{}','인문·독서','문학, 역사, 철학, 사회과학을 탐구하며 인간과 사회를 이해하는 독서 동아리','etf-humanities-social',true,'open',10000,10000,10000,100000,1000000000,now()),
('mechanism','메커니즘','{}','공학','관심 분야별 팀을 구성해 공학 프로젝트를 직접 기획하고 진행하는 동아리','etf-tech-engineering',true,'open',10000,10000,10000,100000,1000000000,now()),
('insight','인사이트','{}','인문·사회','인문학과 사회과학 관점으로 사회 현상을 분석하고 탐구하는 동아리','etf-humanities-social',true,'open',10000,10000,10000,100000,1000000000,now()),
('paradigm','패러다임','{}','사회문제·토론','우리나라 사회 문제를 탐구하고 해결 방안을 토론하는 동아리','etf-humanities-social',true,'open',10000,10000,10000,100000,1000000000,now()),
('rechem','Re:chem',array['리켐'],'화학','일상 속 현상을 화학 원리로 탐구하고 실험·토론하는 동아리','etf-natural-science',true,'open',10000,10000,10000,100000,1000000000,now()),
('invelix','invelix',array['인벨릭스'],'코딩·개발','학교 사이트 개발, 서버 관리, 웹 서비스 운영을 하는 코딩 동아리','etf-tech-engineering',true,'open',10000,10000,10000,100000,1000000000,now()),
('architecture','건축학부','{}','건축·디자인','건축물 스케치, 실내건축 디자인, 우드락 건축물 제작 등을 하는 동아리','etf-tech-engineering',true,'open',10000,10000,10000,100000,1000000000,now()),
('mercury','머큐리','{}','과학 실험','물리·화학·생명·지구과학 분야별 실험과 심화 탐구를 진행하는 과학 동아리','etf-natural-science',true,'open',10000,10000,10000,100000,1000000000,now()),
('neon','neon',array['네온'],'밴드·음악','수요음악회, 축제, 외부공연 등을 준비하고 공연하는 밴드 동아리','etf-culture-media',true,'open',10000,10000,10000,100000,1000000000,now()),
('teachist','티치스트','{}','교육','수업 설계, 모의수업, 교육 이슈 탐구를 하는 교육 진로 동아리','etf-humanities-social',true,'open',10000,10000,10000,100000,1000000000,now()),
('chemist','케미스트','{}','화학 실험','화학 실험과 탐구 활동으로 과학적 사고력과 문제 해결 능력을 기르는 동아리','etf-natural-science',true,'open',10000,10000,10000,100000,1000000000,now()),
('art-canvas','아트 캔버스','{}','미술·디자인','드로잉, 채색, 디자인 작업 등 다양한 창작 활동을 하는 미술 동아리','etf-culture-media',true,'open',10000,10000,10000,100000,1000000000,now()),
('startup-patent-lab','창업특허연구소','{}','창업·특허','아이디어를 특허와 창업으로 발전시키고 지식재산 실무를 탐구하는 동아리','etf-business-startup',true,'open',10000,10000,10000,100000,1000000000,now()),
('moment','모멘트','{}','문화콘텐츠·마케팅','케이팝, 영화, 음식 등 문화콘텐츠의 산업 구조와 홍보 전략을 탐구하는 동아리','etf-culture-media',true,'open',10000,10000,10000,100000,1000000000,now()),
('volleyball-love','배구사랑','{}','체육·배구','배구 기본기, 자체 경기, 타교 연습 경기, 대회 출전 등을 하는 체육 동아리','etf-sports',true,'open',10000,10000,10000,100000,1000000000,now()),
('world-scope','월드 스코프','{}','세계문화·사회문화','세계 각국의 문화, 역사, 정치, 사회적 배경을 조사하고 비교 분석하는 동아리','etf-humanities-social',true,'open',10000,10000,10000,100000,1000000000,now()),
('broadcasting','방송부','{}','방송·미디어','교내 방송을 관리하고 행사와 축제를 진행하는 방송 동아리','etf-culture-media',true,'open',10000,10000,10000,100000,1000000000,now()),
('heartbeat','심장박동','{}','심리학','심리학을 바탕으로 다양한 진로 연계 활동과 봉사 프로젝트를 진행하는 동아리','etf-humanities-social',true,'open',10000,10000,10000,100000,1000000000,now()),
('reve','레브','{}','경영·경제','주식 투자 분석, 마케팅 전략, 국제 경제·사회 이슈를 탐구하는 동아리','etf-business-startup',true,'open',10000,10000,10000,100000,1000000000,now()),
('dynamics','다이나믹스','{}','공학 프로젝트','환경, 에너지, 로봇, 소프트웨어 등 자유 주제로 공학 프로젝트를 진행하는 동아리','etf-tech-engineering',true,'open',10000,10000,10000,100000,1000000000,now())
on conflict (id) do nothing;

insert into public.ratings(club_id)
select id from public.clubs
on conflict (club_id) do nothing;

insert into public.public_leaderboard(id) values ('current')
on conflict (id) do nothing;
