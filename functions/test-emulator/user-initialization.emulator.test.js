import assert from 'node:assert/strict';
import test from 'node:test';

import { deleteApp, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

import { createFirestoreUserRepository } from '../src/auth/firebase-adapters.js';
import { createUserInitializationService } from '../src/auth/user-initialization.js';

const projectId = process.env.GCLOUD_PROJECT ?? process.env.GOOGLE_CLOUD_PROJECT;
if (!process.env.FIRESTORE_EMULATOR_HOST || !projectId?.startsWith('demo-')) {
  throw new Error('Emulator integration tests require a demo project and FIRESTORE_EMULATOR_HOST.');
}

if (getApps().length === 0) {
  initializeApp({ projectId });
}

const auth = {
  uid: 'emulator-concurrent-user',
  token: {
    email: 'student@students.example.test',
    email_verified: true,
    name: '에뮬레이터 학생',
    firebase: { sign_in_provider: 'google.com' },
  },
};

async function clearFixture() {
  const firestore = getFirestore();
  await Promise.all([
    firestore.doc(`users/${auth.uid}`).delete(),
    firestore.doc(`publicProfiles/${auth.uid}`).delete(),
  ]);
}

test('Firestore transaction creates one user and one grant under concurrency', async () => {
  await clearFixture();
  let claimWrites = 0;
  const service = createUserInitializationService({
    repository: createFirestoreUserRepository(),
    claimService: {
      async ensureSchoolVerified() { claimWrites += 1; },
    },
    allowedDomain: 'students.example.test',
  });

  const results = await Promise.all(
    Array.from({ length: 20 }, () => service({
      auth,
      data: { nickname: '에뮬학생' },
    })),
  );
  const firestore = getFirestore();
  const [userSnapshot, profileSnapshot] = await Promise.all([
    firestore.doc(`users/${auth.uid}`).get(),
    firestore.doc(`publicProfiles/${auth.uid}`).get(),
  ]);

  assert.equal(results.filter((result) => result.wasCreated).length, 1);
  assert.equal(userSnapshot.data().cash, 1_000_000);
  assert.equal(userSnapshot.data().initialGrantApplied, true);
  assert.equal(profileSnapshot.data().nickname, '에뮬학생');
  assert.equal(claimWrites, 20);

  await clearFixture();
});

test.after(async () => {
  await Promise.all(getApps().map((app) => deleteApp(app)));
});
