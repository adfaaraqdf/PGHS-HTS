import './styles/main.css';

import { renderFatalError } from './components/app-shell.js';

const container = document.querySelector('#app');

async function bootstrap() {
  try {
    const [
      { environment },
      { initializeFirebase },
      { createRouter },
      { createAuthService },
      { createAuthController },
      { createTradingService },
      { createTradeController },
    ] = await Promise.all([
      import('./config/env.js'),
      import('./config/firebase.js'),
      import('./router/router.js'),
      import('./services/auth.js'),
      import('./state/auth-controller.js'),
      import('./services/trading.js'),
      import('./state/trade-controller.js'),
    ]);

    const firebaseServices = initializeFirebase(environment);
    const authService = createAuthService(firebaseServices, {
      allowedSchoolDomain: environment.allowedSchoolDomain,
    });
    const authController = createAuthController(authService);
    const tradeController = createTradeController(createTradingService(firebaseServices));
    createRouter(container, authController, { tradeController }).start();
  } catch (error) {
    console.error('PGHS HTS startup failed.', error);
    renderFatalError(container, error);
  }
}

void bootstrap();
