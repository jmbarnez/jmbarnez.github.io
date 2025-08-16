const { createClient } = require('@supabase/supabase-js');

// This function expects these environment variables to be set in Netlify:
// SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

// Configurable limits
const WINDOW_SECONDS = 60;
const MAX_UPSERTS_PER_WINDOW = 30;

// Utility to read JSON body safely
async function getBody(event) {
  try {
    if (event.body) return JSON.parse(event.body);
  } catch (err) {}
  return {};
}

exports.handler = async function (event, context) {
  // Only allow POST
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method Not Allowed' };

  // Basic auth: expect a Supabase access token in Authorization header: 'Bearer <access_token>'
  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const token = (authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '').trim();
  if (!token) return { statusCode: 401, body: JSON.stringify({ error: 'missing_token' }) };

  const body = await getBody(event);
  const userId = body.user_id;
  const newState = body.state;

  if (!userId || !newState) return { statusCode: 400, body: JSON.stringify({ error: 'missing user_id or state' }) };

  try {
    // Verify token corresponds to the provided user_id and is not expired
    let tokenUserId = null;
    try {
      if (supabase.auth && typeof supabase.auth.getUser === 'function') {
        const { data } = await supabase.auth.getUser(token);
        tokenUserId = data?.user?.id || data?.id || null;
      } else if (supabase.auth && supabase.auth.api && typeof supabase.auth.api.getUser === 'function') {
        const { user } = await supabase.auth.api.getUser(token);
        tokenUserId = user?.id || null;
      }

      // Basic JWT expiry check (decode payload)
      const parts = token.split('.');
      if (parts.length === 3) {
        const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
        if (payload.exp && typeof payload.exp === 'number') {
          const now = Math.floor(Date.now() / 1000);
          if (payload.exp < now - 5) {
            return { statusCode: 401, body: JSON.stringify({ error: 'token_expired' }) };
          }
        }
      }
    } catch (err) {
      console.warn('token verification failed', err);
    }

    if (!tokenUserId || tokenUserId !== userId) {
      return { statusCode: 401, body: JSON.stringify({ error: 'invalid_token' }) };
    }

    // Rate check: count updates in the last WINDOW_SECONDS seconds
    const windowFrom = new Date(Date.now() - WINDOW_SECONDS * 1000).toISOString();
    const { count } = await supabase
      .from('player_state_updates_log')
      .select('id', { count: 'exact' })
      .eq('user_id', userId)
      .gt('created_at', windowFrom);

    if ((count || 0) >= MAX_UPSERTS_PER_WINDOW) {
      return { statusCode: 429, body: JSON.stringify({ error: 'rate_limited' }) };
    }

    // Fetch current state and diff; if unchanged, skip upsert to save write volume
    const { data: existingRow, error: fetchErr } = await supabase.from('player_state').select('state').eq('user_id', userId).single();
    if (fetchErr && fetchErr.code !== 'PGRST116') {
      // PGRST116 = no rows found in some setups; ignore
      console.error('fetchErr', fetchErr);
    }

    const existingState = existingRow?.state || null;
    try {
      const a = JSON.stringify(existingState || {});
      const b = JSON.stringify(newState || {});
      if (a === b) {
        // No meaningful change - don't upsert or log
        console.log(`[player-state] User ${userId}: Skipped (no change)`);
        return { statusCode: 200, body: JSON.stringify({ ok: true, skipped: true }) };
      }
    } catch (err) {
      // If stringify fails, fall back to upsert
    }

    // Upsert state since it's different
    const { error: upsertErr } = await supabase
      .from('player_state')
      .upsert({ user_id: userId, state: newState, updated_at: new Date().toISOString() }, { onConflict: 'user_id' });

    if (upsertErr) {
      console.error('upsertErr', upsertErr);
      return { statusCode: 500, body: JSON.stringify({ error: 'upsert_failed' }) };
    }

    // Log the update for rate-limiting metrics
    await supabase.from('player_state_updates_log').insert([{ user_id: userId }]);

    console.log(`[player-state] User ${userId}: Success`);
    return { statusCode: 200, body: JSON.stringify({ ok: true }) };
  } catch (err) {
    console.error(`[player-state] User ${userId}: Error`, err);
    return { statusCode: 500, body: JSON.stringify({ error: 'internal' }) };
  }
};


