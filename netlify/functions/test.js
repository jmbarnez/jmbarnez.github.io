// Load environment variables from .env file
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });

exports.handler = async (event, context) => {
  console.log('Test function called!');
  console.log('Environment variables:', {
    SUPABASE_URL: process.env.SUPABASE_URL ? 'SET' : 'MISSING',
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY ? 'SET' : 'MISSING',
    JWT_SECRET: process.env.JWT_SECRET ? 'SET' : 'MISSING'
  });
  
  return {
    statusCode: 200,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ 
      message: 'Test function works!',
      timestamp: new Date().toISOString()
    })
  };
};