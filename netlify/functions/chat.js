// Database-only chat for Netlify Functions
const { 
  addChatMessage, 
  getChatMessages, 
  addPlayer, 
  getActivePlayers, 
  updatePlayerActivity 
} = require('./lib/supabase');

function sanitize(text) {
  if (typeof text !== 'string') return '';
  let s = text.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (s.length > 280) s = s.slice(0, 280);
  return s;
}

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

exports.handler = async (event, context) => {
  console.log('=== Chat Function Call ===');
  console.log('Path:', event.path);
  console.log('Method:', event.httpMethod);
  console.log('Environment check:');
  console.log('SUPABASE_URL:', process.env.SUPABASE_URL ? 'SET' : 'MISSING');
  console.log('SUPABASE_SERVICE_ROLE_KEY:', process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'MISSING');
  
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type, authorization',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const { httpMethod, path, body } = event;
  const pathParams = new URL(`http://localhost${event.path}`).pathname.split('/');
  const action = pathParams[pathParams.length - 1]; // Last segment

  try {
    if (httpMethod === 'GET' && action === 'messages') {
      // Get recent messages from database
      const since = parseInt(event.queryStringParameters?.since || '0');
      console.log('Messages request - since:', since);
      
      try {
        const dbMessages = await getChatMessages(since);
        console.log('Found', dbMessages.length, 'messages from database');
        
        // Convert database format to client format
        const messages = dbMessages.map(msg => ({
          type: msg.type,
          text: msg.text,
          name: msg.player_name,
          id: msg.player_id,
          ts: new Date(msg.created_at).getTime()
        }));
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            messages: messages,
            ts: Date.now()
          })
        };
      } catch (error) {
        console.error('Error fetching messages:', error);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Failed to fetch messages' })
        };
      }
    }

    if (httpMethod === 'GET' && action === 'players') {
      // Get active players from database
      try {
        const activePlayers = await getActivePlayers();
        console.log('Found', activePlayers.length, 'active players from database');
        
        // Convert database format to client format
        const players = activePlayers.map(player => ({
          id: player.player_id,
          name: player.player_name
        }));
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            players: players,
            ts: Date.now()
          })
        };
      } catch (error) {
        console.error('Error fetching players:', error);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Failed to fetch players' })
        };
      }
    }

    if (httpMethod === 'POST' && action === 'join') {
      // Player joining chat - accepts optional playerId to allow client reuse
      const { name, playerId: suppliedId } = JSON.parse(body || '{}');
      const willUseId = suppliedId || generateId();
      const playerName = sanitize(name) || `Adventurer-${willUseId}`;

      console.log('Player joining:', playerName, 'with ID:', willUseId, '(suppliedId:', !!suppliedId, ')');

      try {
        // Check if this player already exists (by id)
        let existing = null;
        try {
          const active = await getActivePlayers();
          existing = active.find(p => p.player_id === willUseId || p.player_name === playerName);
        } catch (e) {
          console.warn('Could not check existing players before join:', e?.message || e);
        }

        // Upsert player row
        const player = await addPlayer(willUseId, playerName);
        console.log('Player upsert result:', player);

        // Do not create or return any system join message. Presence is tracked in chat_players only.
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            playerId: willUseId,
            playerName,
            message: null
          })
        };
      } catch (error) {
        console.error('Error during join - Full error:', error);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Failed to join chat', details: error.message })
        };
      }
    }

    if (httpMethod === 'POST' && action === 'message') {
      // Send a chat message
      const { playerId, text, playerName } = JSON.parse(body || '{}');
      
      if (!playerId) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Missing player ID' })
        };
      }
      
      const sanitizedText = sanitize(text);
      
      if (!sanitizedText) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Empty message' })
        };
      }
      
      console.log('Message request - Player ID:', playerId, 'Text:', sanitizedText);
      
      try {
        // Update player activity
        await updatePlayerActivity(playerId);
        
        // Add message to database
        const message = await addChatMessage('chat', sanitizedText, playerName, playerId);
        
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            ok: true,
            message: {
              type: message.type,
              text: message.text,
              name: message.player_name,
              id: message.player_id,
              ts: new Date(message.created_at).getTime()
            }
          })
        };
      } catch (error) {
        console.error('Error sending message:', error);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Failed to send message' })
        };
      }
    }

    if (httpMethod === 'POST' && action === 'leave') {
      // Player leaving chat - remove from active players and post leave message
      const { playerId, playerName } = JSON.parse(body || '{}');
      if (!playerId) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'Missing playerId' }) };
      }
      try {
        // Remove player row
        const { error: delErr } = await require('./lib/supabase').deletePlayer?.(playerId) || {};
        // If deletePlayer is not implemented, fallback to deleting via supabase client
        if (delErr) console.warn('deletePlayer returned error:', delErr);

        // Do not create leave system messages; simply remove presence
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true }) };
      } catch (error) {
        console.error('Error handling leave:', error);
        return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to leave' }) };
      }
    }

    if (httpMethod === 'GET' && action === 'test') {
      // Test database connection
      try {
        console.log('Testing database connection...');
        const testPlayers = await getActivePlayers();
        console.log('Database test successful, found players:', testPlayers.length);
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify({ 
            status: 'Database connection OK',
            players: testPlayers.length,
            timestamp: Date.now()
          })
        };
      } catch (error) {
        console.error('Database test failed:', error);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ 
            error: 'Database connection failed',
            details: error.message,
            code: error.code
          })
        };
      }
    }

    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: 'Chat endpoint not found' })
    };

  } catch (error) {
    console.error('Chat failed');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Chat failed' })
    };
  }
};