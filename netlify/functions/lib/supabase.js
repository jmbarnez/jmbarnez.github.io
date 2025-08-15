// Supabase integration helper
const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  console.warn('Supabase environment variables not set');
}

const supabase = createClient(supabaseUrl, supabaseServiceKey);

// Example functions for when you're ready to integrate:

async function createUser(username, passwordHash) {
  const { data, error } = await supabase
    .from('users')
    .insert([
      { 
        username: username,
        password_hash: passwordHash
      }
    ])
    .select();
  
  if (error) throw error;
  return data[0];
}

async function getUserByUsername(username) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('username', username)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function getUserById(id) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

async function getSaveData(userId) {
  const { data, error } = await supabase
    .from('user_saves')
    .select('save_data')
    .eq('user_id', userId)
    .single();
  
  if (error && error.code !== 'PGRST116') throw error;
  return data?.save_data || null;
}

async function setSaveData(userId, saveData) {
  const { data, error } = await supabase
    .from('user_saves')
    .upsert([
      {
        user_id: userId,
        save_data: saveData
      }
    ]);
  
  if (error) throw error;
  return data;
}

async function deleteUser(userId) {
  const { error: saveError } = await supabase
    .from('user_saves')
    .delete()
    .eq('user_id', userId);
  
  const { error: userError } = await supabase
    .from('users')
    .delete()
    .eq('id', userId);
  
  if (userError) throw userError;
  return true;
}

module.exports = {
  createUser,
  getUserByUsername,
  getUserById,
  getSaveData,
  setSaveData,
  deleteUser
};