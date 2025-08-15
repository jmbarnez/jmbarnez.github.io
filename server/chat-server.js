/*
 Minimal WebSocket chat server for Phase 1
 - Broadcasts chat messages to all clients
 - Simple rate limiting (4 msgs/5s)
 - Basic sanitization and length limits
*/

const http = require('http');
const { WebSocketServer } = require('ws');

const PORT = process.env.CHAT_PORT ? Number(process.env.CHAT_PORT) : 3001;

const server = http.createServer((req, res) => {
  // Handle CORS for HTTP requests
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  
  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    res.end();
    return;
  }
  
  res.writeHead(404);
  res.end('Chat server - WebSocket only');
});

const wss = new WebSocketServer({ 
  server,
  verifyClient: (info) => {
    // Allow connections from any origin
    return true;
  }
});

function generateId() {
  return Math.random().toString(36).slice(2, 10);
}

function sanitize(text) {
  if (typeof text !== 'string') return '';
  let s = text.replace(/[\u0000-\u001F\u007F]/g, '').trim();
  if (s.length > 280) s = s.slice(0, 280);
  return s;
}

const clients = new Map(); // ws -> { id, name, bucket }
let globalMarketListings = []; // Store market listings globally across all clients

function nowMs() { return Date.now(); }

function canSend(client) {
  const windowMs = 5000;
  const maxMsgs = 4;
  const t = nowMs();
  client.bucket = client.bucket?.filter((ts) => t - ts < windowMs) || [];
  if (client.bucket.length >= maxMsgs) return false;
  client.bucket.push(t);
  return true;
}

function broadcast(obj) {
  const payload = JSON.stringify(obj);
  wss.clients.forEach((peer) => {
    if (peer.readyState === 1) {
      try { peer.send(payload); } catch {}
    }
  });
}

function broadcastPlayerList() {
  const players = [];
  clients.forEach((client, ws) => {
    if (ws.readyState === 1) { // Only include connected clients
      players.push({ id: client.id, name: client.name });
    }
  });
  console.log('Broadcasting player list:', players);
  broadcast({ type: 'players', players, ts: Date.now() });
}

wss.on('connection', (ws, req) => {
  const id = generateId();
  const client = { id, name: `Adventurer-${id}`, bucket: [] };
  clients.set(ws, client);
  
  console.log(`New connection: ${client.name} (${client.id}), total clients: ${clients.size}`);

  // Send hello
  try { ws.send(JSON.stringify({ type: 'system', text: 'Welcome to Global Chat!', ts: Date.now() })); } catch {}
  
  // Send initial player list to the new connection after a short delay
  setTimeout(() => {
    console.log('Sending initial player list to new connection');
    broadcastPlayerList();
  }, 100);

  ws.on('message', (data) => {
    try {
      const msg = JSON.parse(String(data));
      if (msg && msg.type === 'hello' && msg.name) {
        const oldName = client.name;
        client.name = sanitize(String(msg.name)) || client.name;
        console.log(`Client name updated: ${oldName} -> ${client.name}`);
        // Broadcast updated player list when someone connects
        broadcastPlayerList();
        return;
      }
      if (msg && msg.type === 'requestPlayers') {
        console.log('Received requestPlayers from client');
        // Send player list to the requesting client
        broadcastPlayerList();
        return;
      }
      if (msg && msg.type === 'chat') {
        const text = sanitize(String(msg.text || ''));
        if (!text) return;
        if (!canSend(client)) {
          try { ws.send(JSON.stringify({ type: 'system', text: 'Rate limit: slow down', ts: Date.now() })); } catch {}
          return;
        }
        broadcast({ type: 'chat', id: client.id, name: client.name, text, ts: Date.now() });
      }
      if (msg && msg.type === 'marketListing') {
        // Handle new market listing
        const listing = msg.listing;
        if (listing && listing.id && listing.item && listing.seller) {
          // Remove any existing listing with the same ID (prevent duplicates)
          globalMarketListings = globalMarketListings.filter(l => l.id !== listing.id);
          globalMarketListings.push(listing);
          console.log(`New market listing from ${client.name}: ${listing.item} x${listing.quantity} for ${listing.price} coins`);
          // Broadcast to all clients immediately
          broadcast({ type: 'marketUpdate', action: 'add', listing, ts: Date.now() });
          // Send updated full list to all clients
          broadcast({ type: 'marketData', listings: globalMarketListings, ts: Date.now() });
        }
      }
      if (msg && msg.type === 'marketRequest') {
        // Send all current listings to requesting client
        console.log(`Sending ${globalMarketListings.length} market listings to ${client.name}`);
        try { 
          ws.send(JSON.stringify({ 
            type: 'marketData', 
            listings: globalMarketListings, 
            ts: Date.now() 
          })); 
        } catch {}
      }
      if (msg && msg.type === 'marketRemove') {
        // Remove a listing
        const listingId = msg.listingId;
        const originalLength = globalMarketListings.length;
        globalMarketListings = globalMarketListings.filter(listing => 
          listing.id !== listingId
        );
        if (globalMarketListings.length < originalLength) {
          console.log(`Removed market listing ${listingId} from ${client.name}`);
          // Broadcast removal to all clients
          broadcast({ type: 'marketUpdate', action: 'remove', listingId, ts: Date.now() });
          // Send updated full list to all clients
          broadcast({ type: 'marketData', listings: globalMarketListings, ts: Date.now() });
        }
      }
      if (msg && msg.type === 'marketBuy') {
        // Handle market purchase
        const { listingId, quantity, buyerName } = msg;
        const listingIndex = globalMarketListings.findIndex(l => l.id === listingId);
        if (listingIndex !== -1) {
          const listing = globalMarketListings[listingIndex];
          if (listing.quantity >= quantity) {
            listing.quantity -= quantity;
            if (listing.quantity <= 0) {
              globalMarketListings.splice(listingIndex, 1);
            }
            console.log(`Market purchase: ${buyerName} bought ${quantity}x ${listing.item} from ${listing.seller}`);
            // Broadcast the purchase and updated listings
            broadcast({ type: 'marketPurchase', listingId, quantity, buyerName, listing, ts: Date.now() });
            broadcast({ type: 'marketData', listings: globalMarketListings, ts: Date.now() });
          }
        }
      }
    } catch (error) {
      console.error('Error processing message:', error);
    }
  });

  ws.on('close', () => {
    console.log(`Client disconnected: ${client.name} (${client.id}), remaining clients: ${clients.size - 1}`);
    clients.delete(ws);
    // Broadcast updated player list when someone disconnects
    broadcastPlayerList();
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[chat] WebSocket server listening on ws://0.0.0.0:${PORT}`);
  console.log(`[chat] accessible at ws://localhost:${PORT} and your network IP`);
});


