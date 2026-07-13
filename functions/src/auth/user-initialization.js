import { AuthInitializationError } from './errors.js';
import {
  parseInitializationRequest,
  validateNickname,
  validateSchoolIdentity,
} from './policy.js';

export const INITIAL_CASH = 1_000_000;

export function createUserInitializationService({
  repository,
  claimService,
  allowedDomain,
  forbiddenWords = [],
}) {
  return async ({ auth, data }) => {
    const request = parseInitializationRequest(data);
    const identity = validateSchoolIdentity(auth, allowedDomain);
    const nickname = Object.hasOwn(request, 'nickname')
      ? validateNickname(request.nickname, forbiddenWords)
      : undefined;

    const result = await repository.initialize({ identity, nickname });
    await claimService.ensureSchoolVerified(identity.uid);

    return Object.freeze({
      user: Object.freeze({
        nickname: result.nickname,
        cash: result.cash,
        estimatedTotalAsset: result.estimatedTotalAsset,
        accountStatus: result.accountStatus,
      }),
      wasCreated: result.wasCreated,
      tokenRefreshRequired: true,
    });
  };
}

export function requireNicknameForNewUser(nickname) {
  if (!nickname) {
    throw new AuthInitializationError(
      'failed-precondition',
      '처음 이용하는 계정은 닉네임을 입력해야 합니다.',
      'nickname-required',
    );
  }
  return nickname;
}
