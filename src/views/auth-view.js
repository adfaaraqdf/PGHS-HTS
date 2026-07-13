export function renderAuthView(container, state, actions) {
  if (state.status === 'loading') {
    container.innerHTML = `
      <main class="auth-screen" aria-busy="true">
        <span class="status-card__spinner auth-spinner" aria-hidden="true"></span>
        <p>${escapeHtml(state.message)}</p>
      </main>`;
    return;
  }

  if (state.status === 'signed-out') {
    container.innerHTML = `
      <main class="auth-screen">
        <section class="auth-card" aria-labelledby="login-title">
          <p class="eyebrow">학교 축제 모의투자</p>
          <h1 id="login-title">학교 계정으로 시작하기</h1>
          <p class="auth-description">학교에서 발급한 Google 계정만 이용할 수 있습니다.</p>
          <form data-login-form>
            <label for="login-nickname">처음 이용할 때 사용할 닉네임</label>
            <input id="login-nickname" name="nickname" type="text" minlength="2" maxlength="16" autocomplete="nickname" placeholder="2~16자, 재로그인은 비워도 됩니다" />
            <button class="button auth-button" type="submit">Google 계정으로 로그인</button>
          </form>
        </section>
      </main>`;
    container.querySelector('[data-login-form]').addEventListener('submit', (event) => {
      event.preventDefault();
      void actions.login(new FormData(event.currentTarget).get('nickname'));
    });
    return;
  }

  if (state.status === 'nickname-required') {
    container.innerHTML = `
      <main class="auth-screen">
        <section class="auth-card" aria-labelledby="nickname-title">
          <p class="eyebrow">최초 1회 설정</p>
          <h1 id="nickname-title">닉네임을 정해 주세요</h1>
          <p class="auth-description">공개 화면에는 실명이나 이메일 대신 닉네임만 사용됩니다.</p>
          <form data-nickname-form>
            <label for="required-nickname">닉네임</label>
            <input id="required-nickname" name="nickname" type="text" minlength="2" maxlength="16" autocomplete="nickname" required />
            <button class="button auth-button" type="submit">계정 만들기</button>
          </form>
          <button class="text-button" type="button" data-logout>다른 계정 사용</button>
        </section>
      </main>`;
    bindNicknameActions(container, actions);
    return;
  }

  const isDenied = state.status === 'denied';
  container.innerHTML = `
    <main class="auth-screen" role="alert">
      <section class="auth-card">
        <p class="eyebrow">${isDenied ? '접근할 수 없음' : '문제가 발생했습니다'}</p>
        <h1>${isDenied ? '학교 계정을 확인해 주세요.' : '사용자 정보를 준비하지 못했습니다.'}</h1>
        <p class="auth-description">${escapeHtml(state.message)}</p>
        <button class="button auth-button" type="button" data-retry>다시 시도</button>
        <button class="text-button" type="button" data-logout>다른 계정 사용</button>
      </section>
    </main>`;
  container.querySelector('[data-retry]').addEventListener('click', () => void actions.retry());
  container.querySelector('[data-logout]').addEventListener('click', () => void actions.logout());
}

function bindNicknameActions(container, actions) {
  container.querySelector('[data-nickname-form]').addEventListener('submit', (event) => {
    event.preventDefault();
    void actions.submitNickname(new FormData(event.currentTarget).get('nickname'));
  });
  container.querySelector('[data-logout]').addEventListener('click', () => void actions.logout());
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
