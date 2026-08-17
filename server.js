// server.js — YeBet API + static file server.
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
      if(size > 8 * 1024 * 1024){ // 8MB cap so a house photo fits comfortably
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

function getUser(req){
  const auth = req.headers['authorization'] || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  return db.getUserByToken(token);
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
  { method:'POST', re:/^\/api\/auth\/signup$/, handler: async (req, res) => {
    const body = await readBody(req);
    const { username, password, role, phone, city } = body;
    if(!username || !password) return send(res, 400, { error: 'Username and password are required.' });
    try{
      const user = db.createUser({ username, password, role, phone, city });
      const token = db.createSession(user.username);
      send(res, 200, { token, user: { username: user.username, role: user.role, city: user.city } });
    }catch(e){ send(res, e.status || 500, { error: e.message || 'Something went wrong.' }); }
  }},
  { method:'POST', re:/^\/api\/auth\/login$/, handler: async (req, res) => {
    const body = await readBody(req);
    const user = db.verifyUser(body.username, body.password);
    if(!user) return send(res, 401, { error: 'Incorrect username or password.' });
    const token = db.createSession(user.username);
    send(res, 200, { token, user: { username: user.username, role: user.role, city: user.city } });
  }},
  { method:'GET', re:/^\/api\/auth\/me$/, handler: async (req, res) => {
    const user = getUser(req);
    if(!user) return send(res, 401, { error: 'Please log in.' });
    send(res, 200, { user: { username: user.username, role: user.role, city: user.city } });
  }},
  { method:'GET', re:/^\/api\/listings$/, handler: async (req, res, url) => {
    const q = url.searchParams;
    send(res, 200, db.getListings({
      city: q.get('city'), minPrice: q.get('minPrice'),
      maxPrice: q.get('maxPrice'), bedrooms: q.get('bedrooms')
    }));
  }},
  { method:'GET', re:/^\/api\/listings\/([^/]+)$/, handler: async (req, res, url, m) => {
    const listing = db.getListingById(m[1]);
    if(!listing) return send(res, 404, { error: 'Listing not found.' });
    send(res, 200, { listing });
  }},
  { method:'POST', re:/^\/api\/listings$/, handler: async (req, res) => {
    const user = getUser(req);
    if(!user) return send(res, 401, { error: 'Please log in.' });
    if(user.role !== 'seller') return send(res, 403, { error: 'Only seller accounts can list a house.' });
    const body = await readBody(req);
    try{
      const listing = db.createListing(user.username, body);
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
  console.log(`YeBet running at http://localhost:${PORT}`);
});
