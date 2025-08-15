// Database connectivity test for all services
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

  console.log('=== Database Connectivity Test ===');
  
  const results = {
    timestamp: new Date().toISOString(),
    environment: {
      SUPABASE_URL: supabaseUrl ? 'SET' : 'MISSING',
      SUPABASE_SERVICE_ROLE_KEY: supabaseServiceKey ? 'SET' : 'MISSING'
    },
    tests: []
  };

  try {
    // Test 1: Environment variables
    console.log('Testing environment variables...');
    if (!supabaseUrl || !supabaseServiceKey) {
      results.tests.push({
        name: 'Environment Variables',
        status: 'FAIL',
        error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY'
      });
      
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify(results)
      };
    }

    results.tests.push({
      name: 'Environment Variables',
      status: 'PASS',
      details: 'All required variables are set'
    });

    // Test 2: Supabase client creation
    console.log('Testing Supabase client creation...');
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    results.tests.push({
      name: 'Supabase Client Creation',
      status: 'PASS',
      details: 'Client created successfully'
    });

    // Test 3: Basic connection test
    console.log('Testing basic database connection...');
    try {
      const { data, error } = await supabase
        .from('users')
        .select('id')
        .limit(1);
      
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      
      results.tests.push({
        name: 'Basic Database Connection (users table)',
        status: 'PASS',
        details: `Connection successful, found ${data ? data.length : 0} records`
      });
    } catch (error) {
      results.tests.push({
        name: 'Basic Database Connection (users table)',
        status: 'FAIL',
        error: error.message,
        code: error.code
      });
    }

    // Test 4: Chat tables existence
    console.log('Testing chat tables...');
    
    // Test chat_messages table
    try {
      const { data, error } = await supabase
        .from('chat_messages')
        .select('id')
        .limit(1);
      
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      
      results.tests.push({
        name: 'Chat Messages Table',
        status: 'PASS',
        details: `Table accessible, found ${data ? data.length : 0} records`
      });
    } catch (error) {
      results.tests.push({
        name: 'Chat Messages Table',
        status: 'FAIL',
        error: error.message,
        code: error.code,
        hint: error.code === 'PGRST204' ? 'Table may not exist - run chat setup SQL' : null
      });
    }

    // Test chat_players table
    try {
      const { data, error } = await supabase
        .from('chat_players')
        .select('player_id')
        .limit(1);
      
      if (error && error.code !== 'PGRST116') {
        throw error;
      }
      
      results.tests.push({
        name: 'Chat Players Table',
        status: 'PASS',
        details: `Table accessible, found ${data ? data.length : 0} records`
      });
    } catch (error) {
      results.tests.push({
        name: 'Chat Players Table',
        status: 'FAIL',
        error: error.message,
        code: error.code,
        hint: error.code === 'PGRST204' ? 'Table may not exist - run chat setup SQL' : null
      });
    }

    // Test 5: Write permissions
    console.log('Testing write permissions...');
    try {
      const testId = `test-${Date.now()}`;
      const { data, error } = await supabase
        .from('chat_players')
        .upsert([{
          player_id: testId,
          player_name: 'Test Player',
          last_seen: new Date().toISOString()
        }])
        .select();
      
      if (error) throw error;
      
      // Clean up test record
      await supabase
        .from('chat_players')
        .delete()
        .eq('player_id', testId);
      
      results.tests.push({
        name: 'Write Permissions Test',
        status: 'PASS',
        details: 'Successfully inserted and deleted test record'
      });
    } catch (error) {
      results.tests.push({
        name: 'Write Permissions Test',
        status: 'FAIL',
        error: error.message,
        code: error.code,
        hint: 'Check RLS policies and service role permissions'
      });
    }

    // Summary
    const failedTests = results.tests.filter(t => t.status === 'FAIL');
    const passedTests = results.tests.filter(t => t.status === 'PASS');
    
    results.summary = {
      total: results.tests.length,
      passed: passedTests.length,
      failed: failedTests.length,
      overall: failedTests.length === 0 ? 'ALL TESTS PASSED' : 'SOME TESTS FAILED'
    };

    console.log('Database test results:', results.summary);

    return {
      statusCode: failedTests.length === 0 ? 200 : 500,
      headers,
      body: JSON.stringify(results, null, 2)
    };

  } catch (error) {
    console.error('Database test failed:', error);
    
    results.tests.push({
      name: 'Critical Error',
      status: 'FAIL',
      error: error.message
    });

    return {
      statusCode: 500,
      headers,
      body: JSON.stringify(results, null, 2)
    };
  }
};