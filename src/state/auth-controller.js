const initialState = Object.freeze({ status: 'loading', message: '인증 상태를 확인하고 있습니다.' });

export function createAuthController(authService) {
  let state = initialState;
  let currentUser = null;
  let unsubscribeAuth = () => {};
  const listeners = new Set();

  const setState = (nextState) => {
    state = Object.freeze(nextState);
    listeners.forEach((listener) => listener(state));
  };

  const initialize = async (nickname) => {
    if (!currentUser) {
      setState({ status: 'signed-out' });
      return;
    }

    setState({ status: 'loading', message: '학교 계정과 사용자 정보를 확인하고 있습니다.' });
    try {
      const result = await authService.initializeCurrentUser(currentUser, nickname);
      authService.clearPendingNickname();
      setState({ status: 'authenticated', profile: result.user });
    } catch (error) {
      if (error.reason === 'nickname-required') {
        setState({ status: 'nickname-required', message: error.message });
        return;
      }

      const deniedReasons = new Set([
        'school-account-required',
        'email-not-verified',
        'invalid-account',
        'account-disabled',
        'auth-expired',
      ]);
      setState({
        status: deniedReasons.has(error.reason) ? 'denied' : 'error',
        message: error.message,
      });
    }
  };

  return Object.freeze({
    getState: () => state,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    async start() {
      try {
        await authService.completeRedirect();
      } catch {
        setState({ status: 'error', message: 'Google 로그인 결과를 확인하지 못했습니다.' });
      }

      unsubscribeAuth = authService.subscribe((user) => {
        currentUser = user;
        if (!user) {
          setState({ status: 'signed-out' });
          return;
        }
        void initialize(authService.getPendingNickname());
      });
    },

    async login(nickname) {
      try {
        setState({ status: 'loading', message: 'Google 로그인 화면으로 이동하고 있습니다.' });
        await authService.startGoogleLogin(nickname);
      } catch (error) {
        setState({ status: 'error', message: error.message ?? 'Google 로그인을 시작하지 못했습니다.' });
      }
    },

    async submitNickname(nickname) {
      await initialize(nickname);
    },

    async logout() {
      setState({ status: 'loading', message: '로그아웃하고 있습니다.' });
      try {
        await authService.logout();
      } catch {
        setState({ status: 'error', message: '로그아웃하지 못했습니다. 다시 시도해 주세요.' });
      }
    },

    async retry() {
      if (currentUser) {
        await initialize(authService.getPendingNickname());
      } else {
        setState({ status: 'signed-out' });
      }
    },

    dispose() {
      unsubscribeAuth();
      listeners.clear();
    },
  });
}
