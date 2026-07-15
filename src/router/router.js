import { renderAppShell } from '../components/app-shell.js';
import { getRouteFromHash } from './routes.js';
import { createPlaceholderView } from '../views/placeholder-view.js';
import { renderAuthView } from '../views/auth-view.js';

export function createRouter(container, authController, { tradeController } = {}) {
  let authState = authController.getState();
  let unsubscribeAuthState = () => {};

  const render = () => {
    if (authState.status !== 'authenticated') {
      renderAuthView(container, authState, authController);
      return;
    }

    const route = getRouteFromHash(window.location.hash);
    renderAppShell(container, createPlaceholderView(route), {
      nickname: authState.profile.nickname,
      logout: () => authController.logout(),
    });
    container.querySelector('.app-main').focus();
  };

  const start = () => {
    unsubscribeAuthState = authController.subscribe((nextState) => {
      authState = nextState;
      render();
    });
    window.addEventListener('hashchange', render);
    render();
    void authController.start();
    if (!window.location.hash) {
      window.location.hash = '#/home';
    }
  };

  const dispose = () => {
    window.removeEventListener('hashchange', render);
    unsubscribeAuthState();
    authController.dispose();
    tradeController?.dispose();
  };

  return Object.freeze({ start, dispose });
}
