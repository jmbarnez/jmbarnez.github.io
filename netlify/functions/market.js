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

// In-memory storage (replace with Supabase)
let marketListings = [];

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
    // Get market listings
    if (httpMethod === 'GET' && action === 'listings') {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          listings: marketListings,
          ts: Date.now()
        })
      };
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

      const { item, quantity, price } = JSON.parse(body || '{}');
      
      if (!item || !quantity || !price || quantity <= 0 || price <= 0) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Invalid listing data' })
        };
      }

      const listing = {
        id: generateId(),
        item,
        quantity: parseInt(quantity),
        price: parseInt(price),
        seller: claims.username,
        sellerId: claims.sub,
        createdAt: new Date().toISOString(),
        ts: Date.now()
      };

      marketListings.push(listing);

      // TODO: Save to Supabase
      
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          ok: true,
          listing,
          message: 'Listing created - Supabase integration pending'
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
      
      const listingIndex = marketListings.findIndex(l => l.id === listingId);
      if (listingIndex === -1) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Listing not found' })
        };
      }

      const listing = marketListings[listingIndex];
      
      if (listing.sellerId === claims.sub) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Cannot buy your own listing' })
        };
      }

      if (listing.quantity < quantity) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'Insufficient quantity available' })
        };
      }

      // Update listing quantity
      listing.quantity -= quantity;
      
      // Remove listing if quantity reaches 0
      if (listing.quantity <= 0) {
        marketListings.splice(listingIndex, 1);
      }

      const totalCost = listing.price * quantity;

      // TODO: Implement actual coin deduction/addition via Supabase
      // TODO: Implement actual item transfer via Supabase

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          ok: true,
          purchase: {
            item: listing.item,
            quantity,
            totalCost,
            seller: listing.seller
          },
          message: 'Purchase completed - Supabase integration pending'
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
      
      const listingIndex = marketListings.findIndex(l => l.id === listingId);
      if (listingIndex === -1) {
        return {
          statusCode: 404,
          headers,
          body: JSON.stringify({ error: 'Listing not found' })
        };
      }

      const listing = marketListings[listingIndex];
      
      if (listing.sellerId !== claims.sub) {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ error: 'Can only remove your own listings' })
        };
      }

      marketListings.splice(listingIndex, 1);

      // TODO: Return items to seller via Supabase

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ 
          ok: true,
          message: 'Listing removed - Supabase integration pending'
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