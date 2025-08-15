// Market functionality for Netlify Functions
// Handles market listings, purchases, and global market state

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

// Use Supabase for storage
const { 
  listMarketListings,
  createMarketListingRow,
  removeMarketListingRow,
  buyMarketListingRow
} = require('./lib/supabase');

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'content-type, authorization',
    'Access-Control-Allow-Methods': 'GET, POST, DELETE, OPTIONS',
    'Access-Control-Allow-Credentials': 'true',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const { httpMethod, body } = event;
  const pathParams = new URL(`http://localhost${event.path}`).pathname.split('/');
  const action = pathParams[pathParams.length - 1];

  try {
    // Get market listings (from database)
    if (httpMethod === 'GET' && action === 'listings') {
      const rows = await listMarketListings();
      // Map DB rows to client shape
      const listings = rows.map(r => ({
        id: r.id,
        item: r.item,
        quantity: r.quantity,
        price: r.price,
        seller: r.seller_name,
        sellerId: r.seller_id,
        itemType: r.item_type || null,
        createdAt: r.created_at,
      }));
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ listings, ts: Date.now() })
      };
    }

    // Get pending sales for current user (uncollected)
    if (httpMethod === 'GET' && action === 'pending') {
      const auth = event.headers['authorization'] || event.headers['Authorization'] || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Authentication required' }) };
      const claims = verifyJwt(token);
      if (!claims) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };

      // Use direct supabase client
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
      const { data: rows, error: err } = await supabase
        .from('market_sales')
        .select('*')
        .eq('seller_id', claims.sub)
        .eq('collected', false)
        .order('created_at', { ascending: false });
      if (err) throw err;
      return { statusCode: 200, headers, body: JSON.stringify({ pending: rows || [] }) };
    }

    // Collect coins from sales (all or specific saleId)
    if (httpMethod === 'POST' && action === 'collect') {
      const auth = event.headers['authorization'] || event.headers['Authorization'] || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      if (!token) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Authentication required' }) };
      const claims = verifyJwt(token);
      if (!claims) return { statusCode: 401, headers, body: JSON.stringify({ error: 'Invalid token' }) };

      const { saleId } = JSON.parse(body || '{}');
      const { createClient } = require('@supabase/supabase-js');
      const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

      // Load uncollected sales
      let query = supabase
        .from('market_sales')
        .select('*')
        .eq('seller_id', claims.sub)
        .eq('collected', false);
      if (saleId) query = query.eq('id', saleId);
      const { data: sales, error: salesErr } = await query;
      if (salesErr) throw salesErr;
      if (!sales || sales.length === 0) {
        return { statusCode: 200, headers, body: JSON.stringify({ ok: true, collected: 0, coinsAdded: 0 }) };
      }

      const coinsToAdd = sales.reduce((sum, s) => sum + (s.total_cost || (s.price * s.quantity)), 0);

      // Update user's save coins
      const { getSaveData, setSaveData } = require('./lib/supabase');
      let save = await getSaveData(claims.sub);
      if (!save || typeof save !== 'object') save = {};
      const current = typeof save.coins === 'number' ? save.coins : 0;
      save.coins = current + coinsToAdd;
      await setSaveData(claims.sub, save);

      // Mark sales as collected
      const ids = sales.map(s => s.id);
      const { error: updErr } = await supabase
        .from('market_sales')
        .update({ collected: true, collected_at: new Date().toISOString() })
        .in('id', ids);
      if (updErr) throw updErr;

      return { statusCode: 200, headers, body: JSON.stringify({ ok: true, collected: ids.length, coinsAdded: coinsToAdd, coinsTotal: save.coins }) };
    }

    // Create new market listing
    if (httpMethod === 'POST' && action === 'list') {
      const auth = event.headers['authorization'] || event.headers['Authorization'] || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      
      if (!token) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Authentication required' })
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

      const { item, quantity, price, itemType } = JSON.parse(body || '{}');
      
      if (!item || !quantity || !price || quantity <= 0 || price <= 0) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Invalid listing data' })
        };
      }

      // Persist to database
      let row;
      try {
        row = await createMarketListingRow({
          sellerId: claims.sub,
          sellerName: claims.username,
          item,
          quantity: parseInt(quantity),
          price: parseInt(price),
          itemType: itemType || null
        });
      } catch (dbErr) {
        console.error('Failed to create market listing:', dbErr?.message || dbErr);
        return {
          statusCode: 500,
          headers,
          body: JSON.stringify({ error: 'Failed to create listing', details: dbErr?.message || String(dbErr) })
        };
      }

      const listing = {
        id: row.id,
        item: row.item,
        quantity: row.quantity,
        price: row.price,
        seller: row.seller_name,
        sellerId: row.seller_id,
        itemType: row.item_type || null,
        createdAt: row.created_at
      };

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          ok: true,
          listing,
          message: 'Listing created'
        })
      };
    }

    // Purchase from market
    if (httpMethod === 'POST' && action === 'buy') {
      const auth = event.headers['authorization'] || event.headers['Authorization'] || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      
      if (!token) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Authentication required' })
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

      const { listingId, quantity } = JSON.parse(body || '{}');
      const result = await buyMarketListingRow({
        buyerId: claims.sub,
        buyerName: claims.username,
        listingId,
        quantity: parseInt(quantity)
      });
      const listing = result.listing;
      const totalCost = listing.price * parseInt(quantity);

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          ok: true,
          purchase: {
            item: listing.item,
            quantity: parseInt(quantity),
            totalCost,
            seller: listing.seller_name,
            itemType: listing.item_type || null
          },
          message: 'Purchase completed'
        })
      };
    }

    // Remove listing (seller only)
    if (httpMethod === 'DELETE' && action === 'remove') {
      const auth = event.headers['authorization'] || event.headers['Authorization'] || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
      
      if (!token) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'Authentication required' })
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

      const { listingId } = JSON.parse(body || '{}');
      const removed = await removeMarketListingRow({ sellerId: claims.sub, listingId });
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          ok: true,
          message: 'Listing removed'
        })
      };
    }

    return {
      statusCode: 404,
      headers,
      body: JSON.stringify({ error: 'Market endpoint not found' })
    };

  } catch (error) {
    console.error('Market error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Internal server error' })
    };
  }
};