const { getUserById } = require('./lib/supabase');

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
    // Minimal DB check: attempt a trivial query
    // We pick a non-existent UUID to ensure no data leak but validate connectivity
    await getUserById('__healthcheck__');
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true })
    };
  } catch (error) {
    console.error('DB health check failed:', error?.message || error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ ok: false })
    };
  }
};


