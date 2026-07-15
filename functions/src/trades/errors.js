export class TradeError extends Error {
  constructor(code, message, { retryable = false, requestId = null } = {}) {
    super(message);
    this.name = 'TradeError';
    this.code = code;
    this.retryable = retryable;
    this.requestId = requestId;
  }
}
