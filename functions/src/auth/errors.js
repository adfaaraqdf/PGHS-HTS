export class AuthInitializationError extends Error {
  constructor(code, message, reason = code) {
    super(message);
    this.name = 'AuthInitializationError';
    this.code = code;
    this.reason = reason;
  }
}
