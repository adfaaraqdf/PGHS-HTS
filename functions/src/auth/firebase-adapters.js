import { randomBytes } from 'node:crypto';

import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

import { AuthInitializationError } from './errors.js';
import { INITIAL_CASH, requireNicknameForNewUser } from './user-initialization.js';

export function createFirestoreUserRepository() {
  const firestore = getFirestore();

  return {
    async initialize({ identity, nickname }) {
      const publicId = randomBytes(18).toString('base64url');
      const userRef = firestore.doc(`users/${identity.uid}`);
      const profileRef = firestore.doc(`publicProfiles/${identity.uid}`);

      return firestore.runTransaction(async (transaction) => {
        const [userSnapshot, profileSnapshot] = await Promise.all([
          transaction.get(userRef),
          transaction.get(profileRef),
        ]);
        const serverTimestamp = FieldValue.serverTimestamp();

        if (userSnapshot.exists) {
          const user = userSnapshot.data();
          if (user.accountStatus !== 'active') {
            throw new AuthInitializationError(
              'permission-denied',
              '사용할 수 없는 계정입니다.',
              'account-disabled',
            );
          }

          transaction.update(userRef, {
            displayName: identity.displayName,
            updatedAt: serverTimestamp,
            lastLoginAt: serverTimestamp,
          });

          if (!profileSnapshot.exists) {
            transaction.create(profileRef, {
              schemaVersion: 1,
              publicId,
              nickname: user.nickname,
              accountStatus: 'active',
              createdAt: serverTimestamp,
              updatedAt: serverTimestamp,
            });
          } else {
            transaction.update(profileRef, {
              accountStatus: 'active',
              updatedAt: serverTimestamp,
            });
          }

          return {
            nickname: user.nickname,
            cash: user.cash,
            estimatedTotalAsset: user.estimatedTotalAsset,
            accountStatus: user.accountStatus,
            wasCreated: false,
          };
        }

        if (profileSnapshot.exists) {
          throw new AuthInitializationError(
            'failed-precondition',
            '사용자 데이터 정합성을 확인할 수 없습니다.',
            'profile-conflict',
          );
        }

        const initialNickname = requireNicknameForNewUser(nickname);
        transaction.create(userRef, {
          schemaVersion: 1,
          uid: identity.uid,
          displayName: identity.displayName,
          nickname: initialNickname,
          cash: INITIAL_CASH,
          estimatedTotalAsset: INITIAL_CASH,
          accountStatus: 'active',
          initialGrantApplied: true,
          assetValuationAt: null,
          createdAt: serverTimestamp,
          updatedAt: serverTimestamp,
          lastLoginAt: serverTimestamp,
        });
        transaction.create(profileRef, {
          schemaVersion: 1,
          publicId,
          nickname: initialNickname,
          accountStatus: 'active',
          createdAt: serverTimestamp,
          updatedAt: serverTimestamp,
        });

        return {
          nickname: initialNickname,
          cash: INITIAL_CASH,
          estimatedTotalAsset: INITIAL_CASH,
          accountStatus: 'active',
          wasCreated: true,
        };
      });
    },
  };
}

export function createFirebaseClaimService() {
  const auth = getAuth();

  return {
    async ensureSchoolVerified(uid) {
      const user = await auth.getUser(uid);
      const existingClaims = user.customClaims ?? {};
      if (existingClaims.schoolVerified === true) {
        return;
      }

      await auth.setCustomUserClaims(uid, {
        ...existingClaims,
        schoolVerified: true,
      });
    },
  };
}
