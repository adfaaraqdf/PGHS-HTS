import { getApp, getApps, initializeApp } from 'firebase/app';
import {
  ReCaptchaEnterpriseProvider,
  ReCaptchaV3Provider,
  initializeAppCheck,
} from 'firebase/app-check';
import { connectAuthEmulator, getAuth } from 'firebase/auth';
import { connectFirestoreEmulator, getFirestore } from 'firebase/firestore';
import { connectFunctionsEmulator, getFunctions } from 'firebase/functions';

let services;

export function initializeFirebase(environment) {
  if (services) {
    return services;
  }

  const app = getApps().length > 0 ? getApp() : initializeApp(environment.firebaseConfig);
  const appCheck = initializeFirebaseAppCheck(app, environment);
  const auth = getAuth(app);
  const firestore = getFirestore(app);
  const functions = getFunctions(app, environment.functionsRegion);

  if (environment.useEmulators) {
    connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
    connectFirestoreEmulator(firestore, '127.0.0.1', 8080);
    connectFunctionsEmulator(functions, '127.0.0.1', 5001);
  }

  services = Object.freeze({ app, appCheck, auth, firestore, functions });
  return services;
}

function initializeFirebaseAppCheck(app, environment) {
  if (environment.useEmulators) {
    return null;
  }

  const provider = environment.appCheckProvider === 'recaptcha-enterprise'
    ? new ReCaptchaEnterpriseProvider(environment.appCheckSiteKey)
    : new ReCaptchaV3Provider(environment.appCheckSiteKey);

  return initializeAppCheck(app, {
    provider,
    isTokenAutoRefreshEnabled: true,
  });
}
