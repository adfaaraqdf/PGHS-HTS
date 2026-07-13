import { routeDefinitions } from '../router/routes.js';

export function createPlaceholderView(route) {
  const definition = routeDefinitions[route];
  return {
    route,
    content: `
      <section class="screen-placeholder" aria-labelledby="screen-title">
        <p class="eyebrow">STAGE 1 · APP SHELL</p>
        <h1 id="screen-title">${definition.title}</h1>
        <div class="status-card">
          <span class="status-card__spinner" aria-hidden="true"></span>
          <div>
            <h2>준비 중</h2>
            <p>${definition.description}</p>
          </div>
        </div>
        <div class="empty-state">
          <p>표시할 데이터가 없습니다.</p>
          <button class="button button--secondary" type="button" disabled>나중에 다시 시도</button>
        </div>
      </section>`,
  };
}
