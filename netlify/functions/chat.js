// Simple HTTP-based chat for Netlify Functions
// Since Netlify doesn't support persistent WebSocket connections,
// we'll use HTTP endpoints with polling for real-time-ish chat

// In a production setup, you'd want to use:
// - Supabase Realtime for WebSocket-like functionality
// - Or a dedicated WebSocket service like Pusher/Socket.io

let messages = []; // In-memory storage (will reset on function restart)
let players = new Map(); // Player list

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
      // Get recent messages
      const since = parseInt(event.queryStringParameters?.since || '0');
      const recentMessages = messages.filter(msg => msg.ts > since);
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          messages: recentMessages,
          ts: Date.now()
        })
      };
    }

    if (httpMethod === 'GET' && action === 'players') {
      // Get current players
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          players: Array.from(players.values()),
          ts: Date.now()
        })
      };
    }

    if (httpMethod === 'POST' && action === 'join') {
      // Player joining chat
      const { name } = JSON.parse(body || '{}');
      const playerId = generateId();
      const playerName = sanitize(name) || `Adventurer-${playerId}`;
      
      players.set(playerId, { id: playerId, name: playerName });
      
      // Add system message
      const joinMessage = {
        type: 'system',
        text: `${playerName} joined the chat`,
        ts: Date.now()
      };
      messages.push(joinMessage);
      
      // Keep only last 100 messages
      if (messages.length > 100) {
        messages = messages.slice(-100);
      }
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          playerId,
          playerName,
          message: joinMessage
        })
      };
    }

    if (httpMethod === 'POST' && action === 'message') {
      // Send a chat message
      const { playerId, text } = JSON.parse(body || '{}');
      
      if (!playerId || !players.has(playerId)) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Invalid player' })
        };
      }
      
      const player = players.get(playerId);
      const sanitizedText = sanitize(text);
      
      if (!sanitizedText) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Empty message' })
        };
      }
      
      const message = {
        type: 'chat',
        id: player.id,
        name: player.name,
        text: sanitizedText,
        ts: Date.now()
      };
      
      messages.push(message);
      
      // Keep only last 100 messages
      if (messages.length > 100) {
        messages = messages.slice(-100);
      }
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          ok: true,
          message
        })
      };
    }

    if (httpMethod === 'POST' && action === 'leave') {
      // Player leaving chat
      const { playerId } = JSON.parse(body || '{}');
      
      if (playerId && players.has(playerId)) {
        const player = players.get(playerId);
        players.delete(playerId);
        
        // Add system message
        const leaveMessage = {
          type: 'system',
          text: `${player.name} left the chat`,
          ts: Date.now()
        };
        messages.push(leaveMessage);
        
        // Keep only last 100 messages
        if (messages.length > 100) {
          messages = messages.slice(-100);
        }
      }
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ ok: true })
      };
    }

    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: 'Chat endpoint not found' })
    };

  } catch (error) {
    console.error('Chat error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};