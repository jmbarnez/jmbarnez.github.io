Supabase Realtime integration guide for jmbarnez.github.io

Overview
--------
This repository includes helper SQL and functions to integrate Supabase Realtime in an efficient, cost-conscious way.

What we added
- `sql/supabase_player_state.sql` - SQL to create `player_state` and an updates log.
- `netlify/functions/supabase-upsert-player-state.js` - Netlify function that performs rate-checked upserts to `player_state` using the Supabase service_role key.
- `src/utils/supabaseClient.js` - lightweight client wrapper for subscribing to a player's state.

How it works
- Clients send debounced state updates to the Netlify function (`/.netlify/functions/supabase-upsert-player-state`) with body `{ user_id, state }`.
- The function rate-limits per-user and upserts to `player_state` using the service role key.
- Supabase Realtime delivers an `UPDATE` event to subscribers of `player_state:user_id=eq.{user_id}`.

Deployment notes
- Add these env vars to Netlify (Site settings → Build & deploy → Environment):
  - `SUPABASE_URL`
  - `SUPABASE_SERVICE_ROLE_KEY` (keep secret)

- Add these env vars to your frontend build or inject them at runtime:
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`

Security
- Do **not** expose `SUPABASE_SERVICE_ROLE_KEY` to browsers.
- Use RLS (the SQL file enables RLS on `player_state`) so clients cannot write directly.

Client usage example
--------------------
```js
import { supabase, subscribeToPlayerState } from './utils/supabaseClient';

// subscribe
const sub = subscribeToPlayerState('player-123', (row) => {
  console.log('player state updated', row.state);
});

// send debounced updates to Netlify function
function sendStateUpdate(state) {
  fetch('/.netlify/functions/supabase-upsert-player-state', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user_id: 'player-123', state })
  }).then(r => r.json()).then(console.log).catch(console.error);
}

// Remember to unsubscribe when appropriate
// supabase.removeSubscription(sub)
```

Monitoring
- Use Supabase Studio to watch `player_state_updates_log` counts.
- If you approach limits, raise `WINDOW_SECONDS` and lower `MAX_UPSERTS_PER_WINDOW` to throttle further.

Next steps
- Add server-side diffing (only upsert if meaningful delta) to reduce writes further.
- Add more robust auth checks in the Netlify function (validate incoming token) if desired.


