// Load environment variables from .env file  
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../../.env') });

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
    .select('save_data, updated_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(1);
  
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : null;
  return row?.save_data || null;
}

async function setSaveData(userId, saveData) {
  const { data, error } = await supabase
    .from('user_saves')
    .upsert([
      {
        user_id: userId,
        save_data: saveData
      }
    ], { onConflict: 'user_id' });
  
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

// Chat functions
async function addChatMessage(type, text, playerName, playerId) {
  console.log('addChatMessage called with:', { type, text, playerName, playerId });
  
  try {
    const { data, error } = await supabase
      .from('chat_messages')
      .insert([
        {
          type: type,
          text: text,
          player_name: playerName,
          player_id: playerId,
          created_at: new Date().toISOString()
        }
      ])
      .select();
    
    console.log('addChatMessage result:', { data, error });
    
    if (error) {
      console.error('addChatMessage error:', error);
      throw error;
    }
    return data[0];
  } catch (err) {
    console.error('addChatMessage exception:', err);
    throw err;
  }
}

async function getChatMessages(since) {
  const { data, error } = await supabase
    .from('chat_messages')
    .select('*')
    .gt('created_at', new Date(since).toISOString())
    .order('created_at', { ascending: true })
    .limit(50);
  
  if (error) throw error;
  return data || [];
}

async function addPlayer(playerId, playerName) {
  console.log('addPlayer called with:', { playerId, playerName });
  
  try {
    const { data, error } = await supabase
      .from('chat_players')
      .upsert([
        {
          player_id: playerId,
          player_name: playerName,
          last_seen: new Date().toISOString()
        }
      ], { onConflict: 'player_id' })
      .select();
    
    console.log('addPlayer result:', { data, error });
    
    if (error) {
      console.error('addPlayer error:', error);
      throw error;
    }
    return data[0];
  } catch (err) {
    console.error('addPlayer exception:', err);
    throw err;
  }
}

async function getActivePlayers() {
  // Get players active in the last 2 minutes
  const twoMinutesAgo = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  
  const { data, error } = await supabase
    .from('chat_players')
    .select('*')
    .gt('last_seen', twoMinutesAgo)
    .order('last_seen', { ascending: false });
  
  if (error) throw error;
  return data || [];
}

async function updatePlayerActivity(playerId) {
  const { data, error } = await supabase
    .from('chat_players')
    .update({ last_seen: new Date().toISOString() })
    .eq('player_id', playerId);
  
  if (error) throw error;
  return data;
}

module.exports = {
  createUser,
  getUserByUsername,
  getUserById,
  getSaveData,
  setSaveData,
  deleteUser,
  addChatMessage,
  getChatMessages,
  addPlayer,
  getActivePlayers,
  updatePlayerActivity,
  // Market functions will be appended below
};

// ------------------------ MARKET FUNCTIONS ------------------------

async function listMarketListings() {
  const { data, error } = await supabase
    .from('market_listings')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data || [];
}

async function createMarketListingRow({ sellerId, sellerName, item, quantity, price, itemType }) {
  // Try inserting with the canonical column names first.
  try {
    const { data, error } = await supabase
      .from('market_listings')
      .insert([
        {
          seller_id: sellerId,
          seller_name: sellerName,
          item,
          quantity,
          price,
          item_type: itemType || null,
          created_at: new Date().toISOString()
        }
      ])
      .select()
      .single();
    if (error) throw error;
    return data;
  } catch (err) {
    // If schema differs (column name mismatch), try common alternatives to be resilient.
    const msg = (err && err.message) ? String(err.message).toLowerCase() : '';
    console.warn('Primary insert failed, attempting fallback inserts. Error:', err?.message || err);

    // If problem references 'item' column, try 'item_name' or 'name'
    if (msg.includes("could not find the 'item' column") || msg.includes("column \"item\" does not exist") || msg.includes('item')) {
      const altCandidates = [
        { item_col: 'item_name', item_type_col: 'item_type' },
        { item_col: 'name', item_type_col: 'type' }
      ];
      for (const cand of altCandidates) {
        try {
          const payload = {
            seller_id: sellerId,
            seller_name: sellerName,
            quantity,
            price,
            created_at: new Date().toISOString()
          };
          payload[cand.item_col] = item;
          if (cand.item_type_col) payload[cand.item_type_col] = itemType || null;

          const { data: d2, error: e2 } = await supabase
            .from('market_listings')
            .insert([payload])
            .select()
            .single();
          if (e2) throw e2;
          return d2;
        } catch (e2) {
          console.warn('Fallback insert failed for candidate', cand, e2?.message || e2);
          continue;
        }
      }
    }

    // Nothing worked - rethrow original
    throw err;
  }
}

async function removeMarketListingRow({ sellerId, listingId }) {
  const { data, error } = await supabase
    .from('market_listings')
    .delete()
    .eq('id', listingId)
    .eq('seller_id', sellerId)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function buyMarketListingRow({ buyerId, buyerName, listingId, quantity }) {
  // Fetch listing
  const { data: listing, error: fetchErr } = await supabase
    .from('market_listings')
    .select('*')
    .eq('id', listingId)
    .single();
  if (fetchErr) throw fetchErr;
  if (!listing) throw new Error('Listing not found');
  if (listing.seller_id === buyerId) throw new Error('Cannot buy your own listing');
  if (listing.quantity < quantity) throw new Error('Insufficient quantity available');

  const remaining = listing.quantity - quantity;

  if (remaining <= 0) {
    const { error: delErr } = await supabase
      .from('market_listings')
      .delete()
      .eq('id', listingId);
    if (delErr) throw delErr;
  } else {
    // Optimistic concurrency: guard on previous quantity
    const { data: updData, error: updErr } = await supabase
      .from('market_listings')
      .update({ quantity: remaining })
      .eq('id', listingId)
      .eq('quantity', listing.quantity)
      .select();
    if (updErr) throw updErr;
    if (!updData || updData.length === 0) throw new Error('Listing modified, please retry');
  }

  // Record sale
  const totalCost = listing.price * quantity;
  const { data: saleRow, error: saleErr } = await supabase
    .from('market_sales')
    .insert([
      {
        listing_id: listing.id,
        seller_id: listing.seller_id,
        seller_name: listing.seller_name,
        buyer_id: buyerId,
        buyer_name: buyerName,
        item: listing.item,
        quantity: quantity,
        price: listing.price,
        total_cost: totalCost,
        created_at: new Date().toISOString()
      }
    ])
    .select()
    .single();
  if (saleErr) throw saleErr;

  return { listing, sale: saleRow, remaining };
}

module.exports.listMarketListings = listMarketListings;
module.exports.createMarketListingRow = createMarketListingRow;
module.exports.removeMarketListingRow = removeMarketListingRow;
module.exports.buyMarketListingRow = buyMarketListingRow;

// Optional helper to delete a player (used by chat leave)
async function deletePlayer(playerId) {
  const { data, error } = await supabase
    .from('chat_players')
    .delete()
    .eq('player_id', playerId)
    .select()
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

module.exports.deletePlayer = deletePlayer;