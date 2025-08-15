const crypto = require('crypto');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

function sha256(s) { 
  return crypto.createHash('sha256').update(s).digest('hex'); 
}

function signJwt(payload, expSec = 60 * 60 * 24 * 7) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ 
    ...payload, 
    exp: Math.floor(Date.now() / 1000) + expSec 
  })).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}

exports.handler = async (event, context) => {
  // Handle CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type, authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { 
      statusCode: 405, 
      headers, 
      body: JSON.stringify({ error: 'Method not allowed' }) 
    };
  }

  try {
    const { username, password } = JSON.parse(event.body || '{}');
    
    if (!username || !password) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing credentials' })
      };
    }

    const { getUserByUsername } = require('./lib/supabase');
    
    // Authenticate user
    const passwordHash = sha256(password);
    const user = await getUserByUsername(username);
    
    if (!user || user.password_hash !== passwordHash) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'Invalid credentials' })
      };
    }

    const token = signJwt({ sub: user.id, username: user.username });
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        token, 
        user: { id: user.id, username: user.username }
      })
    };
    
  } catch (error) {
    console.error('Login failed');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Login failed' })
    };
  }
};