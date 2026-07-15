import { renderAppShell } from '../components/app-shell.js';
import { getRouteFromHash } from './routes.js';
import { createPlaceholderView } from '../views/placeholder-view.js';
import { renderAuthView } from '../views/auth-view.js';
import { createStageSixView } from '../views/stage-six-view.js';

export function createRouter(container, authController, { marketData, tradeController, getUid = () => null } = {}) {
  let authState = authController.getState();
  let unsubscribeAuthState = () => {};
  let disposeCurrentView = () => {};

  const render = () => {
    disposeCurrentView();
    disposeCurrentView = () => {};
    if (authState.status !== 'authenticated') {
      renderAuthView(container, authState, authController);
      return;
    }

    const route = getRouteFromHash(window.location.hash);
    const view = createStageSixView(route, { marketData, tradeController, uid: getUid() })
      ?? createPlaceholderView(route.name);
    renderAppShell(container, view, {
      nickname: authState.profile.nickname,
      logout: () => authController.logout(),
    });
    container.querySelector('.app-main').focus();
    view.bind?.(container.querySelector('.app-main'));
    disposeCurrentView = view.dispose ?? (() => {});
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
    disposeCurrentView();
    unsubscribeAuthState();
    authController.dispose();
    tradeController?.dispose();
  };

  return Object.freeze({ start, dispose });
}
