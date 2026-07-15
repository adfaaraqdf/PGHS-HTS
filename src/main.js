import './styles/main.css';

import { renderFatalError } from './components/app-shell.js';

const container = document.querySelector('#app');

async function bootstrap() {
  try {
    const [
      { environment },
      { initializeSupabase },
      { createRouter },
      { createAuthService },
      { createAuthController },
      { createTradingService },
      { createTradeController },
      { createMarketDataService },
    ] = await Promise.all([
      import('./config/env.js'),
      import('./config/supabase.js'),
      import('./router/router.js'),
      import('./services/auth.js'),
      import('./state/auth-controller.js'),
      import('./services/trading.js'),
      import('./state/trade-controller.js'),
      import('./services/market-data.js'),
    ]);

    const supabase = initializeSupabase(environment);
    const authService = createAuthService({ supabase }, {
      allowedSchoolDomain: environment.allowedSchoolDomain,
    });
    const authController = createAuthController(authService);
    const tradeController = createTradeController(createTradingService({ supabase }));
    createRouter(container, authController, {
      tradeController,
      marketData: createMarketDataService({ supabase }),
      getUid: () => authController.getState().profile?.uid ?? null,
    }).start();
  } catch (error) {
    console.error('PGHS HTS startup failed.', error);
    renderFatalError(container, error);
  }
}

void bootstrap();
