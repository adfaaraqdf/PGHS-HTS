import { createClient } from '@supabase/supabase-js';

let client;

export function initializeSupabase(environment) {
  if (client) return client;

  client = createClient(environment.supabaseUrl, environment.supabasePublishableKey, {
    auth: {
      autoRefreshToken: true,
      detectSessionInUrl: true,
      persistSession: true,
      flowType: 'pkce',
    },
    realtime: {
      params: { eventsPerSecond: 10 },
    },
  });

  return client;
}
