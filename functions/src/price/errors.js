export class PriceEngineError extends Error {
  constructor(code, message, { retryable = false } = {}) {
    super(message);
    this.name = 'PriceEngineError';
    this.code = code;
    this.retryable = retryable;
  }
}
