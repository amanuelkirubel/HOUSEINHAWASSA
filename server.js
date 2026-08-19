// server.js — House in Hawassa API + static file server.
// Zero external dependencies: only Node's built-in http/fs/path modules,
// so `node server.js` works with no npm install step.
const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const db = require('./db');

const PORT = process.env.PORT || 3000;
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8',
  '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.png':'image/png',
  '.svg':'image/svg+xml', '.ico':'image/x-icon'
};

function send(res, status, body, headers={}){
  res.writeHead(status, Object.assign({ 'Content-Type':'application/json; charset=utf-8' }, headers));
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function readBody(req){
  return new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    req.on('data', c => {
      size += c.length;
      if(size > 25 * 1024 * 1024){ // 25MB cap so up to 10 compressed house photos fit comfortably
        reject(Object.assign(new Error('Upload too large.'), { status: 413 }));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if(!chunks.length) return resolve({});
      try{ resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); }
      catch(e){ resolve({}); }
    });
    req.on('error', reject);
  });
}

// Strip phone numbers, emails, @handles, and telegram/whatsapp/tiktok mentions out of
// user-submitted text so every listing routes buyers back through the official contacts
// instead of a seller's personal number slipped into the title/description.
const CONTACT_PATTERN = /(\+?\d[\d\s\-()]{6,}\d)|(@[a-zA-Z0-9_]{3,})|(\bt\.me\/\S+)|(\btelegram\b)|(\bwhatsapp\b)|(\btiktok\b)|(\b[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}\b)/gi;
function stripContactInfo(text){
  return String(text || '').replace(CONTACT_PATTERN, '').replace(/\s{2,}/g, ' ').trim();
}

// Reads the Bearer token off the request and resolves it to an admin user,
// or null if there's no valid admin session. Used to gate the status-update route.
function getAdminFromRequest(req){
  const header = req.headers['authorization'] || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  const user = db.getUserByToken(token);
  return db.isAdmin(user) ? user : null;
}

function serveStatic(req, res, pathname){
  let filePath = path.join(PUBLIC_DIR, decodeURIComponent(pathname));
  // Prevent path traversal outside /public
  if(!filePath.startsWith(PUBLIC_DIR)) filePath = path.join(PUBLIC_DIR, 'index.html');
  fs.stat(filePath, (err, stat) => {
    if(err || !stat.isFile()){
      // SPA fallback for any non-file, non-/api route
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (e2, data) => {
        if(e2) return send(res, 404, { error: 'Not found.' });
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(data);
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    fs.createReadStream(filePath).pipe(res);
  });
}

const routes = [
  { method:'GET', re:/^\/api\/listings$/, handler: async (req, res, url) => {
    const q = url.searchParams;
    send(res, 200, db.getListings({
      city: q.get('city'), minPrice: q.get('minPrice'),
      maxPrice: q.get('maxPrice'), bedrooms: q.get('bedrooms'),
      type: q.get('type')
    }));
  }},
  { method:'GET', re:/^\/api\/listings\/([^/]+)$/, handler: async (req, res, url, m) => {
    const listing = db.getListingById(m[1]);
    if(!listing) return send(res, 404, { error: 'Listing not found.' });
    send(res, 200, { listing });
  }},
  { method:'POST', re:/^\/api\/listings$/, handler: async (req, res) => {
    const body = await readBody(req);
    if(typeof body.title === 'string') body.title = stripContactInfo(body.title);
    if(typeof body.description === 'string') body.description = stripContactInfo(body.description);
    try{
      const listing = db.createListing('guest', body);
      send(res, 200, { listing });
    }catch(e){ send(res, e.status || 500, { error: e.message || 'Something went wrong.' }); }
  }},
  { method:'POST', re:/^\/api\/admin\/register$/, handler: async (req, res) => {
    const body = await readBody(req);
    try{
      db.createUser({ username: body.email, password: body.password });
      const token = db.createSession(String(body.email||'').toLowerCase().trim());
      send(res, 200, { token });
    }catch(e){ send(res, e.status || 500, { error: e.message || 'Something went wrong.' }); }
  }},
  { method:'POST', re:/^\/api\/admin\/login$/, handler: async (req, res) => {
    const body = await readBody(req);
    const user = db.verifyUser(String(body.email||'').toLowerCase().trim(), body.password);
    if(!user || !db.isAdmin(user)) return send(res, 401, { error: 'Wrong email or password.' });
    const token = db.createSession(user.username);
    send(res, 200, { token });
  }},
  { method:'GET', re:/^\/api\/admin\/me$/, handler: async (req, res) => {
    const admin = getAdminFromRequest(req);
    if(!admin) return send(res, 401, { error: 'Not logged in.' });
    send(res, 200, { email: admin.username });
  }},
  { method:'PATCH', re:/^\/api\/listings\/([^/]+)\/status$/, handler: async (req, res, url, m) => {
    const admin = getAdminFromRequest(req);
    if(!admin) return send(res, 401, { error: 'Admin login required.' });
    const body = await readBody(req);
    const status = body.status === '' ? null : body.status;
    try{
      const listing = db.updateListingStatus(m[1], status);
      send(res, 200, { listing });
    }catch(e){ send(res, e.status || 500, { error: e.message || 'Something went wrong.' }); }
  }},
];

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  if(url.pathname.startsWith('/api/')){
    const route = routes.find(r => r.method === req.method && r.re.test(url.pathname));
    if(!route) return send(res, 404, { error: 'Not found.' });
    const m = url.pathname.match(route.re);
    try{ await route.handler(req, res, url, m); }
    catch(e){ send(res, e.status || 500, { error: e.message || 'Something went wrong.' }); }
    return;
  }
  serveStatic(req, res, url.pathname === '/' ? '/index.html' : url.pathname);
});

server.listen(PORT, () => {
  console.log(`House in Hawassa running at http://localhost:${PORT}`);
});
