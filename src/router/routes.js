export const routeDefinitions = Object.freeze({
  login: { title: '로그인', description: '학교 계정 로그인은 다음 단계에서 연결됩니다.' },
  home: { title: '홈', description: '홈 화면 데이터는 아직 연결되지 않았습니다.' },
  market: { title: '시장', description: '종목 데이터와 검색은 다음 단계에서 연결됩니다.' },
  etf: { title: 'ETF', description: 'ETF 지수 데이터는 아직 연결되지 않았습니다.' },
  portfolio: { title: '내 자산', description: '자산과 보유 종목 데이터는 아직 연결되지 않았습니다.' },
  ranking: { title: '랭킹', description: '실시간 랭킹은 아직 연결되지 않았습니다.' },
  admin: { title: '관리자', description: '관리자 권한과 운영 기능은 아직 연결되지 않았습니다.' },
});

export function getRouteFromHash(hash) {
  const route = hash.replace(/^#\//, '').trim() || 'home';
  return Object.hasOwn(routeDefinitions, route) ? route : 'home';
}
