import { toInteger } from './formatters.js';

export function normalizeSearch(value) {
  return String(value ?? '').normalize('NFC').trim().toLocaleLowerCase('ko-KR');
}

export function matchesClubSearch(club, searchTerm) {
  const term = normalizeSearch(searchTerm);
  if (!term) return true;
  return [club.displayName, ...(Array.isArray(club.aliases) ? club.aliases : [])]
    .some((value) => normalizeSearch(value).includes(term));
}

export function sortClubs(clubs, sortKey = 'name') {
  const copy = [...clubs];
  const numericKeys = { price: 'currentPrice', change: 'priceChangeRate', volume: 'totalVolume' };
  if (numericKeys[sortKey]) {
    const field = numericKeys[sortKey];
    return copy.sort((left, right) => toInteger(right[field]) - toInteger(left[field])
      || String(left.displayName).localeCompare(String(right.displayName), 'ko-KR'));
  }
  return copy.sort((left, right) => String(left.displayName).localeCompare(String(right.displayName), 'ko-KR'));
}

export function buildPortfolio(user, holdings, clubs) {
  const byId = new Map(clubs.map((club) => [club.id, club]));
  const rows = holdings.map((holding) => {
    const club = byId.get(holding.clubId) ?? { id: holding.clubId, displayName: holding.clubId, currentPrice: 0 };
    const quantity = toInteger(holding.quantity);
    const averagePrice = toInteger(holding.averagePurchasePrice ?? holding.averageBuyPrice);
    const currentPrice = toInteger(club.currentPrice);
    const valuation = quantity * currentPrice;
    const cost = quantity * averagePrice;
    const profit = valuation - cost;
    return { ...club, ...holding, quantity, averagePrice, currentPrice, valuation, profit, profitRate: cost ? (profit / cost) * 100 : 0 };
  }).filter((row) => row.quantity > 0);
  const stockValue = rows.reduce((total, row) => total + row.valuation, 0);
  const cash = toInteger(user?.cash);
  return { rows, cash, stockValue, totalAsset: cash + stockValue };
}
