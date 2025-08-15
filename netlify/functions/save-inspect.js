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
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type, authorization',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'GET') {
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

    const { createClient } = require('@supabase/supabase-js');
    const supabaseUrl = process.env.SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // List ALL rows for this user_id (to detect duplicates/old rows)
    const { data, error } = await supabase
      .from('user_saves')
      .select('*')
      .eq('user_id', claims.sub);

    if (error) {
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Failed to query saves' }) };
    }

    const result = {
      count: Array.isArray(data) ? data.length : 0,
      saves: (data || []).map((row) => ({
        user_id: row.user_id,
        // include timestamps if present
        created_at: row.created_at || null,
        updated_at: row.updated_at || null,
        // do not inline full save_data by default to keep payload small
        has_save_data: !!row.save_data,
      }))
    };

    return { statusCode: 200, headers, body: JSON.stringify(result) };
    
  } catch (error) {
    console.error('Save inspect failed');
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to inspect saves' })
    };
  }
};


