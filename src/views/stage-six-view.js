import { buildPortfolio, matchesClubSearch, sortClubs } from '../ui/market-model.js';
import {
  escapeHtml, formatKrw, formatNumber, formatRate, movementClass, movementLabel, toInteger,
} from '../ui/formatters.js';

function emptyState(title, message, action = '') {
  return `<section class="empty-state"><h2>${escapeHtml(title)}</h2><p>${escapeHtml(message)}</p>${action}</section>`;
}

function errorState(message) {
  return emptyState('데이터를 불러오지 못했습니다', message, '<button class="button button--secondary" data-retry type="button">다시 시도</button>');
}

function skeleton(count = 3) {
  return `<div class="skeleton-list" aria-label="데이터를 불러오는 중" aria-busy="true">${'<span class="skeleton"></span>'.repeat(count)}</div>`;
}

function clubRow(club, { compact = false } = {}) {
  const change = toInteger(club.priceChange);
  const movement = movementClass(change);
  return `<a class="club-row" href="#/club/${encodeURIComponent(club.id)}">
    <span class="club-icon" aria-hidden="true">${escapeHtml((club.displayName ?? '?').slice(0, 1))}</span>
    <span class="club-row__name"><strong>${escapeHtml(club.displayName)}</strong><small>${escapeHtml(club.category)}</small></span>
    <span class="club-row__price"><strong>${formatKrw(club.currentPrice)}</strong><small class="${movement}"><span aria-hidden="true">${movementLabel(change).slice(0, 1)}</span> ${formatRate(club.priceChangeRate)}</small></span>
    ${compact ? '' : `<span class="club-row__volume">거래량 ${formatNumber(club.totalVolume)}</span>`}
  </a>`;
}

function marketStatus(state) {
  const status = state?.status;
  const labels = { open: '개장 중', halted: '거래 정지', closed: '장 마감' };
  return `<span class="market-status market-status--${escapeHtml(status ?? 'closed')}"><span aria-hidden="true">●</span> ${labels[status] ?? '시장 상태 확인 중'}</span>`;
}

function newsList(items) {
  if (!items.length) return '<p class="muted">표시할 최근 소식이 없습니다.</p>';
  return `<ul class="news-list">${items.map((item) => `<li><strong>${item.isBreaking ? '속보 · ' : ''}${escapeHtml(item.title)}</strong><span>${escapeHtml(item.body)}</span></li>`).join('')}</ul>`;
}

function createBag() {
  const unsubscribers = new Set();
  return {
    add(unsubscribe) { unsubscribers.add(unsubscribe); },
    clear() { unsubscribers.forEach((unsubscribe) => unsubscribe()); unsubscribers.clear(); },
  };
}

export function createStageSixView(route, { marketData, tradeController, uid }) {
  if (route.name === 'home') return createHomeView(marketData);
  if (route.name === 'market') return createMarketView(marketData);
  if (route.name === 'club') return createClubView(route.clubId, marketData, tradeController, uid);
  if (route.name === 'portfolio') return createPortfolioView(marketData, uid);
  return null;
}

function createHomeView(marketData) {
  const bag = createBag();
  const state = { clubs: null, market: null, news: null, error: null };
  const content = `<section class="screen" data-screen="home"><div class="screen-heading"><div><p class="eyebrow">학교 축제 모의투자</p><h1>오늘의 시장</h1></div><div data-market-status>${marketStatus()}</div></div><div data-home-content>${skeleton(7)}</div></section>`;
  const render = (root) => {
    const target = root.querySelector('[data-home-content]');
    root.querySelector('[data-market-status]').innerHTML = marketStatus(state.market);
    if (state.error) { target.innerHTML = errorState(state.error); return; }
    if (!state.clubs || !state.news) { target.innerHTML = skeleton(7); return; }
    const rising = [...state.clubs].sort((a, b) => Number(b.priceChangeRate) - Number(a.priceChangeRate)).slice(0, 3);
    const falling = [...state.clubs].sort((a, b) => Number(a.priceChangeRate) - Number(b.priceChangeRate)).slice(0, 3);
    const popular = [...state.clubs].sort((a, b) => toInteger(b.totalVolume) - toInteger(a.totalVolume)).slice(0, 3);
    target.innerHTML = `<section class="summary-grid"><div class="summary-card"><span>공식 종목</span><strong>${formatNumber(state.clubs.length)}개</strong></div><div class="summary-card"><span>시장 상태</span><strong>${state.market?.status === 'open' ? '개장' : '확인 중'}</strong></div></section>
      <section class="panel"><div class="panel__heading"><h2>TOP 상승</h2><a href="#/market">전체 시장</a></div>${rising.map((club) => clubRow(club, { compact: true })).join('')}</section>
      <section class="panel"><div class="panel__heading"><h2>TOP 하락</h2><a href="#/market">전체 시장</a></div>${falling.map((club) => clubRow(club, { compact: true })).join('')}</section>
      <section class="panel"><div class="panel__heading"><h2>인기 종목</h2><a href="#/market">전체 시장</a></div>${popular.map((club) => clubRow(club, { compact: true })).join('')}</section>
      <section class="panel"><div class="panel__heading"><h2>최근 소식</h2></div>${newsList(state.news)}</section>
      <section class="panel panel--muted"><p class="eyebrow">ETF</p><h2>ETF 미리보기</h2><p>ETF는 다음 단계에서 제공됩니다.</p></section>`;
  };
  const bind = (root) => {
    const fail = () => { state.error = '네트워크 연결을 확인한 뒤 다시 시도해 주세요.'; render(root); };
    const start = () => {
      bag.clear(); state.error = null; render(root);
      bag.add(marketData.subscribeClubs((clubs) => { state.clubs = clubs; render(root); }, fail));
      bag.add(marketData.subscribeMarketState((market) => { state.market = market; render(root); }, fail));
      bag.add(marketData.subscribeNews((news) => { state.news = news; render(root); }, fail));
    };
    root.addEventListener('click', (event) => { if (event.target.closest('[data-retry]')) start(); });
    start();
  };
  return { route: 'home', content, bind, dispose: () => bag.clear() };
}

function createMarketView(marketData) {
  const bag = createBag();
  const state = { clubs: null, error: null, term: '', sort: 'name' };
  const content = `<section class="screen" data-screen="market"><div class="screen-heading"><div><p class="eyebrow">공식 동아리 20개</p><h1>시장</h1></div></div><label class="search-field" for="market-search"><span aria-hidden="true">⌕</span><input id="market-search" type="search" autocomplete="off" placeholder="동아리명 또는 별칭 검색" aria-label="동아리 검색"></label><div class="sort-controls" aria-label="시장 정렬"><button class="sort-button is-selected" data-sort="name" type="button">이름</button><button class="sort-button" data-sort="price" type="button">가격</button><button class="sort-button" data-sort="change" type="button">등락률</button><button class="sort-button" data-sort="volume" type="button">거래량</button></div><div data-market-list>${skeleton(8)}</div></section>`;
  const render = (root) => {
    const target = root.querySelector('[data-market-list]');
    root.querySelectorAll('[data-sort]').forEach((button) => button.classList.toggle('is-selected', button.dataset.sort === state.sort));
    if (state.error) { target.innerHTML = errorState(state.error); return; }
    if (!state.clubs) { target.innerHTML = skeleton(8); return; }
    const clubs = sortClubs(state.clubs.filter((club) => matchesClubSearch(club, state.term)), state.sort);
    target.innerHTML = clubs.length ? `<p class="result-count">${formatNumber(clubs.length)}개 종목</p><div class="market-list">${clubs.map((club) => clubRow(club)).join('')}</div>` : emptyState('검색 결과가 없습니다', '동아리명 또는 한글 별칭으로 다시 검색해 보세요.');
  };
  const bind = (root) => {
    const start = () => {
      bag.clear(); state.error = null; render(root);
      bag.add(marketData.subscribeClubs((clubs) => { state.clubs = clubs; render(root); }, () => { state.error = '시장 목록을 불러오지 못했습니다.'; render(root); }));
    };
    root.querySelector('#market-search').addEventListener('input', (event) => { state.term = event.target.value; render(root); });
    root.addEventListener('click', (event) => {
      const sort = event.target.closest('[data-sort]');
      if (sort) { state.sort = sort.dataset.sort; render(root); }
      if (event.target.closest('[data-retry]')) start();
    });
    start();
  };
  return { route: 'market', content, bind, dispose: () => bag.clear() };
}

function createClubView(clubId, marketData, tradeController, uid) {
  const bag = createBag();
  const state = { club: null, rating: null, news: null, holding: null, error: null, modal: null, result: null, retry: null };
  const content = `<section class="screen" data-screen="club"><a class="back-link" href="#/market">← 시장으로</a><div data-club-content>${skeleton(8)}</div><div data-modal-root></div><p class="toast" aria-live="polite" data-trade-result></p></section>`;
  const render = (root) => {
    const target = root.querySelector('[data-club-content]');
    if (state.error) { target.innerHTML = errorState(state.error); return; }
    if (!state.club) { target.innerHTML = skeleton(8); return; }
    const club = state.club;
    const ratingCount = toInteger(state.rating?.ratingCount ?? club.ratingCount);
    const rating = state.rating?.averageRating ?? club.averageRating;
    const holding = state.holding;
    target.innerHTML = `<section class="club-hero"><span class="club-icon club-icon--large" aria-hidden="true">${escapeHtml(club.displayName.slice(0, 1))}</span><div><p class="eyebrow">${escapeHtml(club.category)}</p><h1>${escapeHtml(club.displayName)}</h1>${club.aliases?.length ? `<p class="aliases">${club.aliases.map(escapeHtml).join(' · ')}</p>` : ''}</div></section>
      <section class="price-card"><strong>${formatKrw(club.currentPrice)}</strong><p class="${movementClass(club.priceChange)}"><span aria-hidden="true">${movementLabel(club.priceChange).slice(0, 1)}</span> ${formatKrw(Math.abs(toInteger(club.priceChange)))} (${formatRate(club.priceChangeRate)})</p></section>
      <section class="panel"><h2>동아리 소개</h2><p>${escapeHtml(club.description)}</p>${club.boothLocation ? `<p><strong>부스 위치</strong> ${escapeHtml(club.boothLocation)}</p>` : ''}${club.operatingHours ? `<p><strong>운영 시간</strong> ${escapeHtml(club.operatingHours)}</p>` : ''}</section>
      <section class="metric-grid"><div><span>별점</span><strong>${ratingCount ? `${Number(rating).toFixed(1)} / 5` : '평가 없음'}</strong></div><div><span>평가 수</span><strong>${formatNumber(ratingCount)}</strong></div><div><span>거래량</span><strong>${formatNumber(club.totalVolume)}</strong></div><div><span>내 보유</span><strong>${formatNumber(holding?.quantity)}주</strong></div></section>
      <section class="panel"><h2>최근 뉴스</h2>${state.news ? newsList(state.news) : skeleton(2)}</section>
      <section class="panel holding-summary"><h2>내 보유 정보</h2><p>평균 매수가 <strong>${holding ? formatKrw(holding.averageBuyPrice) : '-'}</strong></p></section>
      <section class="trade-panel"><label for="trade-quantity">수량</label><input id="trade-quantity" type="number" inputmode="numeric" min="1" step="1" value="1" aria-describedby="trade-preview"><p id="trade-preview">예상 체결 금액 ${formatKrw(club.currentPrice)}</p><div><button class="button button--buy" data-trade="buy" type="button">매수</button><button class="button button--sell" data-trade="sell" type="button">매도</button></div></section>`;
    bindTradeInputs(root, state, tradeController, render);
    renderModal(root, state, tradeController, clubId, render);
    root.querySelector('[data-trade-result]').innerHTML = state.result
      ? `${escapeHtml(state.result)}${state.retry ? ' <button class="text-button" data-trade-retry type="button">같은 주문 재시도</button>' : ''}`
      : '';
  };
  const bind = (root) => {
    const start = () => {
      bag.clear(); state.error = null; render(root);
      const fail = () => { state.error = '종목 정보를 불러오지 못했습니다.'; render(root); };
      bag.add(marketData.subscribeClub(clubId, (club) => { state.club = club; if (!club) state.error = '존재하지 않는 종목입니다.'; render(root); }, fail));
      bag.add(marketData.subscribeRating(clubId, (rating) => { state.rating = rating; render(root); }, fail));
      bag.add(marketData.subscribeClubNews(clubId, (news) => { state.news = news; render(root); }, fail));
      if (uid) bag.add(marketData.subscribeHoldings(uid, (holdings) => { state.holding = holdings.find((item) => item.clubId === clubId) ?? null; render(root); }, fail));
    };
    root.addEventListener('click', (event) => {
      if (event.target.closest('[data-retry]')) start();
      if (event.target.closest('[data-trade-retry]') && state.retry) {
        state.modal = { side: state.retry.side, quantity: state.retry.quantity };
        render(root);
      }
    });
    start();
  };
  return { route: 'club', content, bind, dispose: () => bag.clear() };
}

function bindTradeInputs(root, state, tradeController, render) {
  const quantityInput = root.querySelector('#trade-quantity');
  quantityInput?.addEventListener('input', () => {
    const quantity = Number(quantityInput.value);
    root.querySelector('#trade-preview').textContent = Number.isSafeInteger(quantity) && quantity > 0 ? `예상 체결 금액 ${formatKrw(quantity * toInteger(state.club.currentPrice))}` : '1 이상의 정수 수량을 입력해 주세요.';
  });
  root.querySelectorAll('[data-trade]').forEach((button) => button.addEventListener('click', () => {
    const quantity = Number(quantityInput.value);
    if (!Number.isSafeInteger(quantity) || quantity <= 0) { state.result = '수량은 1 이상의 정수여야 합니다.'; render(root); return; }
    if (tradeController.isPending(button.dataset.trade, state.club.id)) return;
    state.retry = null;
    state.modal = { side: button.dataset.trade, quantity };
    render(root);
  }));
}

function renderModal(root, state, tradeController, clubId, render) {
  const target = root.querySelector('[data-modal-root]');
  if (!state.modal) { target.innerHTML = ''; return; }
  const { side, quantity } = state.modal;
  const pending = tradeController.isPending(side, clubId);
  target.innerHTML = `<div class="modal-backdrop" role="presentation"><section class="trade-modal" role="dialog" aria-modal="true" aria-labelledby="trade-modal-title"><h2 id="trade-modal-title">${side === 'buy' ? '매수' : '매도'} 주문 확인</h2><dl><div><dt>종목</dt><dd>${escapeHtml(state.club.displayName)}</dd></div><div><dt>수량</dt><dd>${formatNumber(quantity)}주</dd></div><div><dt>예상 체결 금액</dt><dd>${formatKrw(quantity * toInteger(state.club.currentPrice))}</dd></div></dl><p class="muted">서버 체결 시 현재 가격이 달라질 수 있습니다.</p><div class="modal-actions"><button class="button button--secondary" data-modal-cancel type="button" ${pending ? 'disabled' : ''}>취소</button><button class="button ${side === 'buy' ? 'button--buy' : 'button--sell'}" data-modal-submit type="button" ${pending ? 'disabled' : ''}>${pending ? '요청 중…' : '주문 요청'}</button></div></section></div>`;
  target.querySelector('[data-modal-cancel]').addEventListener('click', () => { state.modal = null; render(root); });
  target.querySelector('[data-modal-submit]').addEventListener('click', async () => {
    try {
      const retryKey = state.retry?.side === side && state.retry?.quantity === quantity ? state.retry.idempotencyKey : undefined;
      const result = await tradeController[side]({ clubId, quantity, idempotencyKey: retryKey });
      state.result = `${side === 'buy' ? '매수' : '매도'} 주문이 처리되었습니다. 실제 체결가 ${formatKrw(result.executionPrice)}.`;
      state.retry = null;
    } catch (error) {
      state.result = error.message;
      if (error.retryable && error.idempotencyKey) {
        state.retry = { idempotencyKey: error.idempotencyKey, quantity, side };
      }
    } finally { state.modal = null; render(root); }
  });
}

function createPortfolioView(marketData, uid) {
  const bag = createBag();
  const state = { clubs: null, user: null, holdings: null, error: null };
  const content = `<section class="screen" data-screen="portfolio"><div class="screen-heading"><div><p class="eyebrow">내 계정</p><h1>내 자산</h1></div></div><div data-portfolio-content>${skeleton(6)}</div></section>`;
  const render = (root) => {
    const target = root.querySelector('[data-portfolio-content]');
    if (state.error) { target.innerHTML = errorState(state.error); return; }
    if (!state.clubs || !state.user || !state.holdings) { target.innerHTML = skeleton(6); return; }
    const portfolio = buildPortfolio(state.user, state.holdings, state.clubs);
    target.innerHTML = `<section class="asset-total"><span>총 자산</span><strong>${formatKrw(portfolio.totalAsset)}</strong><div><span>보유 현금 ${formatKrw(portfolio.cash)}</span><span>주식 평가액 ${formatKrw(portfolio.stockValue)}</span></div></section>${portfolio.rows.length ? `<section class="panel"><h2>보유 종목</h2><div class="portfolio-list">${portfolio.rows.map((row) => `<a class="portfolio-row" href="#/club/${encodeURIComponent(row.id)}"><span><strong>${escapeHtml(row.displayName)}</strong><small>${formatNumber(row.quantity)}주 · 평균 ${formatKrw(row.averagePrice)}</small></span><span><strong>${formatKrw(row.valuation)}</strong><small class="${movementClass(row.profit)}">${formatKrw(row.profit)} · ${formatRate(row.profitRate)}</small></span></a>`).join('')}</div></section>` : emptyState('보유한 종목이 없습니다', '시장 화면에서 관심 있는 동아리를 찾아보세요.', '<a class="button" href="#/market">시장 보기</a>')}`;
  };
  const bind = (root) => {
    const start = () => {
      bag.clear(); state.error = null; render(root);
      const fail = () => { state.error = '내 자산을 불러오지 못했습니다.'; render(root); };
      bag.add(marketData.subscribeClubs((clubs) => { state.clubs = clubs; render(root); }, fail));
      if (!uid) { fail(); return; }
      bag.add(marketData.subscribeUser(uid, (user) => { state.user = user; render(root); }, fail));
      bag.add(marketData.subscribeHoldings(uid, (holdings) => { state.holdings = holdings; render(root); }, fail));
    };
    root.addEventListener('click', (event) => { if (event.target.closest('[data-retry]')) start(); });
    start();
  };
  return { route: 'portfolio', content, bind, dispose: () => bag.clear() };
}
