// Load environment variables from .env file
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

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
    console.log('Login attempt started');
    console.log('Environment variables:', {
      SUPABASE_URL: process.env.SUPABASE_URL ? 'SET' : 'MISSING',
      SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'MISSING',
      JWT_SECRET: process.env.JWT_SECRET ? 'SET' : 'MISSING'
    });
    
    const { username, password } = JSON.parse(event.body || '{}');
    console.log('Parsed credentials:', { username: username ? 'PROVIDED' : 'MISSING', password: password ? 'PROVIDED' : 'MISSING' });
    
    if (!username || !password) {
      console.log('Missing credentials error');
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ error: 'Missing credentials' })
      };
    }

    console.log('Importing supabase lib...');
    const { getUserByUsername } = require('./lib/supabase');
    
    // Authenticate user
    console.log('Hashing password...');
    const passwordHash = sha256(password);
    console.log('Getting user from database...');
    const user = await getUserByUsername(username);
    console.log('User lookup result:', user ? 'FOUND' : 'NOT_FOUND');
    
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
    console.error('Login failed with error:', error.message);
    console.error('Full error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Login failed' })
    };
  }
};