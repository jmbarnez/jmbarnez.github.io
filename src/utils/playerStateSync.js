import { getSupabase } from './supabaseClient.js';
import { debounce } from './performance.js';

// Small helper to manage debounced, token-authenticated upserts to the Netlify function
const lastSent = new Map(); // userId -> JSON string

async function sendPlayerStateImmediate(userId, state, attempt = 0) {
  const supabase = getSupabase();
  const session = (supabase && supabase.auth && typeof supabase.auth.getSession === 'function')
    ? await supabase.auth.getSession().then(r => r.data?.session)
    : (supabase && supabase.auth && typeof supabase.auth.session === 'function')
      ? supabase.auth.session()
      : null;

  const token = session?.access_token || session?.provider_token || session?.token || null;
  if (!token) {
    // No logged-in session - skip or throw
    console.warn('No supabase session token available to send player state');
    return { ok: false, error: 'no_session' };
  }

  try {
    const res = await fetch('/.netlify/functions/supabase-upsert-player-state', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`
      },
      body: JSON.stringify({ user_id: userId, state })
    });

    if (res.status === 429 && attempt < 3) {
      // Backoff and retry
      const wait = Math.pow(2, attempt) * 250; // 250ms, 500ms, 1000ms
      await new Promise(r => setTimeout(r, wait));
      return sendPlayerStateImmediate(userId, state, attempt + 1);
    }

    const json = await res.json().catch(() => ({}));
    return { status: res.status, ok: res.ok, body: json };
  } catch (err) {
    console.error('sendPlayerStateImmediate error', err);
    return { ok: false, error: 'network' };
  }
}

// Debounced public function. Coalesces rapid calls and avoids sending identical state.
export const sendPlayerState = debounce(async (userId, state) => {
  try {
    const key = String(userId);
    const s = JSON.stringify(state || {});
    if (lastSent.get(key) === s) {
      return { ok: true, skipped: true };
    }
    const result = await sendPlayerStateImmediate(userId, state);
    if (result && result.ok) {
      lastSent.set(key, JSON.stringify(state || {}));
    }
    return result;
  } catch (err) {
    return { ok: false, error: err };
  }
}, 300);

// Force-send (bypasses debounce) - useful on unload or important moments
export async function flushPlayerState(userId, state) {
  // update cache immediately so subsequent calls don't duplicate
  lastSent.set(String(userId), JSON.stringify(state || {}));
  return sendPlayerStateImmediate(userId, state);
}


