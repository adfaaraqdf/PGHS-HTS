import assert from 'node:assert/strict';
import test from 'node:test';

import { getRouteFromHash } from '../src/router/routes.js';
import { buildPortfolio, matchesClubSearch, sortClubs } from '../src/ui/market-model.js';

const clubs = [
  { id: 'rechem', displayName: 'Re:chem', aliases: ['리켐'], currentPrice: 10000, priceChangeRate: 1.25, totalVolume: 20 },
  { id: 'invelix', displayName: 'invelix', aliases: ['인벨릭스'], currentPrice: 3000, priceChangeRate: -1.2, totalVolume: 100 },
  { id: 'neon', displayName: 'neon', aliases: ['네온'], currentPrice: 2000, priceChangeRate: 0, totalVolume: 50 },
];

test('market search finds canonical names and Korean aliases without duplicate cards', () => {
  assert.equal(clubs.filter((club) => matchesClubSearch(club, '리켐')).length, 1);
  assert.equal(clubs.filter((club) => matchesClubSearch(club, '인벨릭스')).at(0).id, 'invelix');
  assert.equal(clubs.filter((club) => matchesClubSearch(club, '네온')).at(0).id, 'neon');
  assert.equal(clubs.filter((club) => matchesClubSearch(club, 'Re')).length, 1);
});

test('market sorts only the bounded in-memory catalog', () => {
  assert.deepEqual(sortClubs(clubs, 'volume').map((club) => club.id), ['invelix', 'neon', 'rechem']);
  assert.deepEqual(sortClubs(clubs, 'price').map((club) => club.id), ['rechem', 'invelix', 'neon']);
});

test('portfolio valuation keeps all KRW values as integers', () => {
  const portfolio = buildPortfolio({ cash: 1_000_000 }, [{ clubId: 'neon', quantity: 3, averageBuyPrice: 1700 }], clubs);
  assert.equal(portfolio.stockValue, 6000);
  assert.equal(portfolio.totalAsset, 1_006_000);
  assert.equal(portfolio.rows[0].profit, 900);
});

test('club details use a validated nested route while unknown paths return home', () => {
  assert.deepEqual(getRouteFromHash('#/club/rechem'), { name: 'club', clubId: 'rechem' });
  assert.deepEqual(getRouteFromHash('#/club/not valid'), { name: 'home' });
});
