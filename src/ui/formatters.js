export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function toInteger(value, fallback = 0) {
  return Number.isSafeInteger(value) ? value : fallback;
}

export function formatKrw(value) {
  return `${new Intl.NumberFormat('ko-KR').format(toInteger(value))}원`;
}

export function formatNumber(value) {
  return new Intl.NumberFormat('ko-KR').format(toInteger(value));
}

export function formatRate(value) {
  const rate = Number(value);
  if (!Number.isFinite(rate)) return '0.00%';
  return `${rate > 0 ? '+' : ''}${rate.toFixed(2)}%`;
}

export function movementClass(value) {
  const amount = Number(value);
  if (amount > 0) return 'is-up';
  if (amount < 0) return 'is-down';
  return 'is-flat';
}

export function movementLabel(value) {
  const amount = Number(value);
  if (amount > 0) return '▲ 상승';
  if (amount < 0) return '▼ 하락';
  return '— 보합';
}
