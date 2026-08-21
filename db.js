// db.js — Postgres (Supabase) backed store for House in Hawassa.
// Listings/users/sessions live in Postgres; listing photos live in Supabase
// Storage (public bucket) and we store their public URLs. Nothing here is
// written to the local disk anymore, so restarts/redeploys no longer wipe data.

const crypto = require('crypto');
const { Pool } = require('pg');
const { createClient } = require('@supabase/supabase-js');

if (!process.env.DATABASE_URL) {
  console.error('DATABASE_URL is not set — the app cannot reach the database.');
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false } // required for Supabase's pooled connection
});

const supabase = (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY)
  ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY)
  : null;
if (!supabase) {
  console.warn('SUPABASE_URL / SUPABASE_SERVICE_KEY not set — photos will be stored as base64 in the database instead of Supabase Storage. This works but is slower and heavier. Set both env vars to fix.');
}

const PHOTO_BUCKET = process.env.SUPABASE_PHOTO_BUCKET || 'listing-photos';

const DEFAULT_CITIES = ["Addis Ababa","Hawassa","Bahir Dar","Mekelle","Adama","Dire Dawa","Gondar","Jimma"];

// Only these emails are allowed to ever hold an admin account. Registration
// checks against this list, so a random visitor can never create an admin
// login no matter what they submit.
const ADMIN_EMAILS = ['houseinhawassa@gmail.com', 'houseinethiopia7@gmail.com'];

// ---------- schema ----------
const schemaReady = pool.query(`
  CREATE TABLE IF NOT EXISTS users (
    username text PRIMARY KEY,
    password_hash text NOT NULL,
    phone text DEFAULT '',
    city text DEFAULT '',
    role text DEFAULT 'admin',
    created_at timestamptz DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS listings (
    id serial PRIMARY KEY,
    seller_username text,
    title text NOT NULL,
    photos jsonb DEFAULT '[]',
    city text NOT NULL,
    price numeric NOT NULL,
    bedrooms integer DEFAULT 0,
    bathrooms integer DEFAULT 0,
    area numeric DEFAULT 0,
    description text DEFAULT '',
    status text,
    created_at timestamptz DEFAULT now()
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token text PRIMARY KEY,
    username text NOT NULL,
    created_at timestamptz DEFAULT now()
  );
`).catch(err => {
  console.error('Schema setup failed — check DATABASE_URL:', err.message);
});

// ---------- passwords ----------
function hashPassword(password){
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return salt + ':' + hash;
}
function verifyPassword(password, stored){
  const [salt, hash] = String(stored||'').split(':');
  if(!salt || !hash) return false;
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
}

// ---------- users ----------
async function getUserByUsername(username){
  await schemaReady;
  const { rows } = await pool.query('SELECT * FROM users WHERE lower(username) = lower($1)', [String(username||'')]);
  return rows[0] || null;
}

async function createUser({ username, password, phone, city }){
  await schemaReady;
  const email = String(username || '').toLowerCase().trim();
  if(!ADMIN_EMAILS.includes(email)){
    const err = new Error('That email is not authorized for an admin account.');
    err.status = 403;
    throw err;
  }
  const existing = await getUserByUsername(email);
  if(existing){
    const err = new Error('An account for that email already exists.');
    err.status = 409;
    throw err;
  }
  const { rows } = await pool.query(
    `INSERT INTO users (username, password_hash, phone, city, role) VALUES ($1,$2,$3,$4,'admin') RETURNING *`,
    [email, hashPassword(password), phone || '', city || '']
  );
  return rows[0];
}

async function verifyUser(username, password){
  const user = await getUserByUsername(username);
  if(!user) return null;
  if(!verifyPassword(password, user.password_hash)) return null;
  return user;
}

// ---------- sessions ----------
async function createSession(username){
  await schemaReady;
  const token = crypto.randomBytes(24).toString('hex');
  await pool.query('INSERT INTO sessions (token, username) VALUES ($1,$2)', [token, username]);
  return token;
}

async function getUserByToken(token){
  if(!token) return null;
  await schemaReady;
  const { rows } = await pool.query('SELECT username FROM sessions WHERE token = $1', [token]);
  if(!rows[0]) return null;
  return getUserByUsername(rows[0].username);
}

// ---------- listings ----------
async function getCities(){
  await schemaReady;
  const { rows } = await pool.query(`SELECT DISTINCT city FROM listings WHERE city IS NOT NULL AND city <> ''`);
  const fromListings = rows.map(r => r.city);
  return fromListings.length ? fromListings : DEFAULT_CITIES;
}

function publicListing(row){
  const { seller_username, photos, ...rest } = row;
  let parsedPhotos = photos;
  if(typeof parsedPhotos === 'string'){
    try{ parsedPhotos = JSON.parse(parsedPhotos); }catch(e){ parsedPhotos = []; }
  }
  if(!Array.isArray(parsedPhotos)) parsedPhotos = [];
  return { ...rest, seller_username, photos: parsedPhotos };
}

async function getListings({ city, minPrice, maxPrice, bedrooms } = {}){
  await schemaReady;
  const conditions = [];
  const params = [];
  if(city){ params.push(city); conditions.push(`city = $${params.length}`); }
  if(minPrice){ params.push(Number(minPrice)); conditions.push(`price >= $${params.length}`); }
  if(maxPrice){ params.push(Number(maxPrice)); conditions.push(`price <= $${params.length}`); }
  if(bedrooms){ params.push(Number(bedrooms)); conditions.push(`bedrooms >= $${params.length}`); }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const { rows } = await pool.query(`SELECT * FROM listings ${where} ORDER BY created_at DESC`, params);
  return { listings: rows.map(publicListing), cities: await getCities() };
}

async function getListingById(id){
  await schemaReady;
  const { rows } = await pool.query('SELECT * FROM listings WHERE id = $1', [id]);
  return rows[0] ? publicListing(rows[0]) : null;
}

// Uploads base64 data-URL photos to Supabase Storage and returns their public
// URLs. Falls back to keeping raw base64 (stored in the DB) if Storage isn't
// configured, so the app still works, just less efficiently.
async function uploadPhotos(dataUrls, idHint){
  const list = (Array.isArray(dataUrls) ? dataUrls : [])
    .filter(p => typeof p === 'string' && p.startsWith('data:image/'))
    .slice(0, 10);

  if(!supabase) return list;

  const urls = [];
  for(const dataUrl of list){
    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if(!match) continue;
    const mime = match[1];
    const ext = (mime.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
    const buffer = Buffer.from(match[2], 'base64');
    const filename = `${idHint}/${crypto.randomBytes(8).toString('hex')}.${ext}`;
    const { error } = await supabase.storage.from(PHOTO_BUCKET).upload(filename, buffer, {
      contentType: mime,
      upsert: false
    });
    if(error){
      console.error('Photo upload to Supabase Storage failed:', error.message);
      continue;
    }
    const { data } = supabase.storage.from(PHOTO_BUCKET).getPublicUrl(filename);
    if(data && data.publicUrl) urls.push(data.publicUrl);
  }
  return urls;
}

async function createListing(sellerUsername, payload){
  await schemaReady;
  const title = String(payload.title || '').trim();
  const city = payload.city || '';
  const price = Number(payload.price) || 0;
  if(!title || !city || !price){
    const err = new Error('Title, city and price are required.');
    err.status = 400;
    throw err;
  }
  const rawPhotos = Array.isArray(payload.photos) ? payload.photos
    : (payload.photo_data ? [payload.photo_data] : []);
  const idHint = crypto.randomBytes(6).toString('hex');
  const photos = await uploadPhotos(rawPhotos, idHint);

  const { rows } = await pool.query(
    `INSERT INTO listings (seller_username, title, photos, city, price, bedrooms, bathrooms, area, description, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NULL) RETURNING *`,
    [
      sellerUsername, title, JSON.stringify(photos), city, price,
      Number(payload.bedrooms) || 0, Number(payload.bathrooms) || 0,
      Number(payload.area) || 0, payload.description || ''
    ]
  );
  return publicListing(rows[0]);
}

async function updateListingStatus(id, status){
  const allowed = [null, 'sold', 'urgent'];
  if(!allowed.includes(status)){
    const err = new Error('Status must be sold, urgent, or cleared.');
    err.status = 400;
    throw err;
  }
  await schemaReady;
  const { rows } = await pool.query('UPDATE listings SET status = $1 WHERE id = $2 RETURNING *', [status, id]);
  if(!rows[0]){
    const err = new Error('Listing not found.');
    err.status = 404;
    throw err;
  }
  return publicListing(rows[0]);
}

function isAdmin(user){
  return !!(user && user.role === 'admin');
}

module.exports = {
  createUser, verifyUser, getUserByUsername,
  createSession, getUserByToken, isAdmin,
  getListings, getListingById, createListing, getCities,
  updateListingStatus
};
