import { onCall } from 'firebase-functions/v2/https';
import { defineString } from 'firebase-functions/params';

import { createTradeHandler } from './callable.js';

const allowedSchoolDomain = defineString('ALLOWED_SCHOOL_DOMAIN');
const enforceAppCheck = process.env.FUNCTIONS_EMULATOR !== 'true'
  && process.env.ENFORCE_APP_CHECK === 'true';

export const buyStock = onCall(
  { enforceAppCheck },
  (request) => createTradeHandler({
    side: 'buy',
    allowedDomain: allowedSchoolDomain.value(),
  })(request),
);
