const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

function verifyJwt(token) {
  try {
    const [h, b, s] = token.split('.');
    const expSig = crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${b}`).digest('base64url');
    if (s !== expSig) return null;
    const body = JSON.parse(Buffer.from(b, 'base64url').toString());
    if (body.exp && body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch { 
    return null; 
  }
}

exports.handler = async (event, context) => {
  // Handle CORS
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

  if (event.httpMethod !== 'POST' && event.httpMethod !== 'GET') {
    return { 
      statusCode: 405, 
      headers, 
      body: JSON.stringify({ error: 'Method not allowed' }) 
    };
  }

  try {
    const auth = event.headers['authorization'] || event.headers['Authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    
    if (!token) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'No token provided' })
      };
    }

    const claims = verifyJwt(token);
    if (!claims) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid token' })
      };
    }

    // Handle GET request (load saved data)
    if (event.httpMethod === 'GET') {
      const { getSaveData } = require('./lib/supabase');
      const saveData = await getSaveData(claims.sub);
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          save: saveData || null,
          timestamp: Date.now()
        })
      };
    }

    // Handle POST request (save data)
    // Validate payload
    const rawBody = event.body || '{}';
    // Optional size guard (512KB)
    if (Buffer.byteLength(rawBody, 'utf8') > 512 * 1024) {
      return {
        statusCode: 413,
        headers,
        body: JSON.stringify({ error: 'Save too large' })
      };
    }

    const parsed = JSON.parse(rawBody);
    if (!parsed || typeof parsed.save !== 'object' || parsed.save === null) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Invalid payload' })
      };
    }

    const { save } = parsed;

    const { setSaveData } = require('./lib/supabase');
    
    await setSaveData(claims.sub, save);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true })
    };
    
  } catch (error) {
    console.error('Save storage failed');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to save data' })
    };
  }
};