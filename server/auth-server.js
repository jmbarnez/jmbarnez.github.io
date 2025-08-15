/*
 Minimal auth server: persistent file storage + JWT
 Endpoints:
 - POST /api/register { username, password }
 - POST /api/login { username, password }
 - GET  /api/me (Authorization: Bearer <token>)
 - GET  /api/save (auth) → returns save json
 - POST /api/save (auth, { save }) → stores save json
 NOTE: Uses JSON file storage for persistence across server restarts.
*/
const http = require('http');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const PORT = process.env.AUTH_PORT ? Number(process.env.AUTH_PORT) : 3002;
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret';

// File path for persistent storage
const USERS_FILE = path.join(__dirname, 'users.json');

let users = new Map(); // username -> { id, username, passHash, save }

// Load users from file on startup
function loadUsers() {
  try {
    if (fs.existsSync(USERS_FILE)) {
      const data = fs.readFileSync(USERS_FILE, 'utf8');
      const usersArray = JSON.parse(data);
      users.clear();
      usersArray.forEach(user => {
        users.set(user.username, user);
      });
      console.log(`[auth] Loaded ${users.size} accounts from ${USERS_FILE}`);
    } else {
      console.log(`[auth] No existing users file found, starting with empty accounts`);
    }
  } catch (error) {
    console.error('[auth] Error loading users:', error);
    console.log('[auth] Starting with empty accounts');
  }
}

// Save users to file
function saveUsers() {
  try {
    const usersArray = Array.from(users.values());
    fs.writeFileSync(USERS_FILE, JSON.stringify(usersArray, null, 2));
    console.log(`[auth] Saved ${users.size} accounts to ${USERS_FILE}`);
  } catch (error) {
    console.error('[auth] Error saving users:', error);
  }
}

// Auto-save every 30 seconds
setInterval(saveUsers, 30000);

function json(res, code, obj) {
  res.writeHead(code, { 
    'Content-Type': 'application/json', 
    'Access-Control-Allow-Origin': '*', 
    'Access-Control-Allow-Headers': 'content-type, authorization', 
    'Access-Control-Allow-Methods': 'GET,POST,DELETE,OPTIONS',
    'Access-Control-Allow-Credentials': 'true'
  });
  res.end(JSON.stringify(obj));
}
function parseBody(req) {
  return new Promise((resolve) => {
    let buf = '';
    req.on('data', (c) => (buf += c));
    req.on('end', () => {
      try { resolve(JSON.parse(buf || '{}')); } catch { resolve({}); }
    });
  });
}
function sha256(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

function signJwt(payload, expSec = 60 * 60 * 24 * 7) {
  const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
  const body = Buffer.from(JSON.stringify({ ...payload, exp: Math.floor(Date.now() / 1000) + expSec })).toString('base64url');
  const sig = crypto.createHmac('sha256', JWT_SECRET).update(`${header}.${body}`).digest('base64url');
  return `${header}.${body}.${sig}`;
}
function verifyJwt(token) {
  try {
    const [h, b, s] = token.split('.');
    const expSig = crypto.createHmac('sha256', JWT_SECRET).update(`${h}.${b}`).digest('base64url');
    if (s !== expSig) return null;
    const body = JSON.parse(Buffer.from(b, 'base64url').toString());
    if (body.exp && body.exp < Math.floor(Date.now() / 1000)) return null;
    return body;
  } catch { return null; }
}

const server = http.createServer(async (req, res) => {
  console.log(`[auth] ${req.method} ${req.url}`);
  
  // CORS preflight
  if (req.method === 'OPTIONS') return json(res, 200, {});
  const url = new URL(req.url, `http://localhost:${PORT}`);
  if (req.method === 'POST' && url.pathname === '/api/register') {
    const { username, password } = await parseBody(req);
    if (!username || !password) return json(res, 400, { error: 'Missing fields' });
    if (users.has(username)) return json(res, 409, { error: 'Username already registered' });
    const id = crypto.randomUUID();
    const newUser = { id, username, passHash: sha256(password), save: null };
    users.set(username, newUser);
    saveUsers(); // Persist new account
    const token = signJwt({ sub: id, username });
    return json(res, 200, { token, user: { id, username } });
  }
  if (req.method === 'POST' && url.pathname === '/api/login') {
    const { username, password } = await parseBody(req);
    const u = users.get(username);
    if (!u || u.passHash !== sha256(password || '')) return json(res, 401, { error: 'Invalid credentials' });
    const token = signJwt({ sub: u.id, username });
    return json(res, 200, { token, user: { id: u.id, username: u.username } });
  }
  if (req.method === 'GET' && url.pathname === '/api/me') {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const claims = verifyJwt(token);
    if (!claims) return json(res, 401, { error: 'Unauthorized' });
    return json(res, 200, { user: { id: claims.sub, username: claims.username } });
  }
  if (req.method === 'GET' && url.pathname === '/api/save') {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const claims = verifyJwt(token);
    if (!claims) return json(res, 401, { error: 'Unauthorized' });
    const u = Array.from(users.values()).find((x) => x.id === claims.sub);
    return json(res, 200, { save: u?.save || null });
  }
  if (req.method === 'POST' && url.pathname === '/api/save') {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const claims = verifyJwt(token);
    if (!claims) return json(res, 401, { error: 'Unauthorized' });
    const { save } = await parseBody(req);
    const u = Array.from(users.values()).find((x) => x.id === claims.sub);
    if (!u) return json(res, 404, { error: 'User not found' });
    u.save = save || null;
    saveUsers(); // Persist save data
    return json(res, 200, { ok: true });
  }
  if (req.method === 'DELETE' && url.pathname === '/api/account') {
    const auth = req.headers['authorization'] || '';
    const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const claims = verifyJwt(token);
    if (!claims) return json(res, 401, { error: 'Unauthorized' });
    const u = Array.from(users.values()).find((x) => x.id === claims.sub);
    if (!u) return json(res, 404, { error: 'User not found' });
    // Delete the user account
    users.delete(u.username);
    saveUsers(); // Persist account deletion
    return json(res, 200, { ok: true, message: 'Account deleted successfully' });
  }
  
  // Admin endpoint to wipe all accounts
  if (req.method === 'DELETE' && url.pathname === '/api/admin/wipe-accounts') {
    const { adminKey } = await parseBody(req);
    // Simple admin key check - you can change this to something more secure
    if (adminKey !== 'admin-wipe-2025') {
      return json(res, 403, { error: 'Invalid admin key' });
    }
    const userCount = users.size;
    users.clear();
    saveUsers(); // Persist account wipe
    console.log(`[auth] ADMIN ACTION: Wiped ${userCount} accounts`);
    return json(res, 200, { ok: true, message: `Wiped ${userCount} accounts successfully` });
  }
  
  // Admin endpoint to list all accounts (for debugging)
  if (req.method === 'POST' && url.pathname === '/api/admin/list-accounts') {
    const { adminKey } = await parseBody(req);
    if (adminKey !== 'admin-wipe-2025') {
      return json(res, 403, { error: 'Invalid admin key' });
    }
    const accountList = Array.from(users.values()).map(u => ({
      id: u.id,
      username: u.username,
      hasSave: !!u.save
    }));
    return json(res, 200, { accounts: accountList, total: accountList.length });
  }
  return json(res, 404, { error: 'Not found' });
});

// Load existing accounts on startup
loadUsers();

server.listen(PORT, '0.0.0.0', () => {
  console.log(`[auth] server listening on http://0.0.0.0:${PORT}`);
  console.log(`[auth] accessible at http://localhost:${PORT} and your network IP`);
  console.log(`[auth] accounts will persist to: ${USERS_FILE}`);
}).on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.log(`[auth] Port ${PORT} is already in use. Try stopping other servers first.`);
    console.log(`[auth] Run: taskkill /F /IM node.exe`);
    process.exit(1);
  } else {
    console.error('[auth] Server error:', err);
    process.exit(1);
  }
});

// Graceful shutdown - save accounts before exit
process.on('SIGINT', () => {
  console.log('\n[auth] Shutting down gracefully...');
  saveUsers();
  process.exit(0);
});

process.on('SIGTERM', () => {
  console.log('\n[auth] Shutting down gracefully...');
  saveUsers();
  process.exit(0);
});


