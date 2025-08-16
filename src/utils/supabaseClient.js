import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = (typeof window !== 'undefined' && window.__SUPABASE_URL)
  ? window.__SUPABASE_URL
  : (typeof process !== 'undefined' && process.env ? process.env.SUPABASE_URL : undefined);

const SUPABASE_ANON_KEY = (typeof window !== 'undefined' && window.__SUPABASE_ANON_KEY)
  ? window.__SUPABASE_ANON_KEY
  : (typeof process !== 'undefined' && process.env ? process.env.SUPABASE_ANON_KEY : undefined);

let _supabaseClient = null;
export function getSupabaseClient() {
  if (_supabaseClient) return _supabaseClient;
  if (!SUPABASE_URL) return null;
  _supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY || '');
  return _supabaseClient;
}

export function getSupabase() { return getSupabaseClient(); }

export function subscribeToPlayerState(userId, callback) {
  const supabase = getSupabaseClient();
  if (!supabase) throw new Error('Supabase client not configured (set window.__SUPABASE_URL and window.__SUPABASE_ANON_KEY)');
  return supabase
    .from(`player_state:user_id=eq.${userId}`)
    .on('UPDATE', (payload) => callback(payload.new))
    .subscribe();
}


