const navigationItems = [
  { route: 'home', label: '홈', icon: '⌂' },
  { route: 'market', label: '시장', icon: '▤' },
  { route: 'etf', label: 'ETF', icon: '◇' },
  { route: 'portfolio', label: '내 자산', icon: '◒' },
  { route: 'ranking', label: '랭킹', icon: '♛' },
];

export function renderAppShell(container, view, session) {
  const navigation = navigationItems
    .map(
      ({ route, label, icon }) => `
        <a class="bottom-nav__item ${view.route === route ? 'is-active' : ''}" href="#/${route}" aria-current="${view.route === route ? 'page' : 'false'}">
          <span class="bottom-nav__icon" aria-hidden="true">${icon}</span>
          <span>${label}</span>
        </a>`,
    )
    .join('');

  container.innerHTML = `
    <div class="app-shell">
      <header class="app-header">
        <a class="brand" href="#/home" aria-label="PGHS HTS 홈">PGHS <span>HTS</span></a>
        <div class="session-actions">
          <span class="session-nickname">${escapeHtml(session.nickname)}</span>
          <button class="text-button" type="button" data-session-logout>로그아웃</button>
        </div>
      </header>
      <main class="app-main" tabindex="-1">
        ${view.content}
      </main>
      <nav class="bottom-nav" aria-label="주요 메뉴">
        ${navigation}
      </nav>
    </div>`;
  container.querySelector('[data-session-logout]').addEventListener('click', () => {
    void session.logout();
  });
}

export function renderFatalError(container, error) {
  container.innerHTML = `
    <main class="fatal-error" role="alert">
      <p class="eyebrow">설정 확인 필요</p>
      <h1>서비스를 시작할 수 없습니다.</h1>
      <p>${escapeHtml(error.message)}</p>
      <p class="fatal-error__hint">.env.example을 참고해 현재 환경의 공개 Firebase 설정을 입력한 뒤 다시 시작하세요.</p>
      <button class="button" type="button" data-retry>다시 시도</button>
    </main>`;

  container.querySelector('[data-retry]').addEventListener('click', () => window.location.reload());
}

function escapeHtml(value) {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
