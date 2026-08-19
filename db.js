// db.js — simple JSON-file backed store for House in Hawassa.
// No native/compiled dependencies, so it runs anywhere Node runs.
// Swap this out for a real database later without changing server.js's calling shape too much.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const DATA_DIR = path.join(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

const DEFAULT_CITIES = ["Addis Ababa","Hawassa","Bahir Dar","Mekelle","Adama","Dire Dawa","Gondar","Jimma"];

// Only these emails are allowed to ever hold an admin account. Registration
// checks against this list, so a random visitor can never create an admin
// login no matter what they submit.
const ADMIN_EMAILS = ['houseinhawassa@gmail.com', 'houseinethiopia7@gmail.com'];

function emptyDb(){
  return { users: [], listings: [], sessions: [], nextListingId: 1 };
}

function load(){
  if(!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if(!fs.existsSync(DB_FILE)){
    save(emptyDb());
  }
  try{
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
  }catch(e){
    // Corrupt or empty file — start fresh rather than crash the server.
    const fresh = emptyDb();
    save(fresh);
    return fresh;
  }
}

function save(db){
  fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
}

// ---------- passwords ----------
function hashPassword(password){
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return salt + ':' + hash;
}
function verifyPassword(password, stored){
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(check, 'hex'));
}

// ---------- users ----------
function getUserByUsername(username){
  const db = load();
  return db.users.find(u => u.username.toLowerCase() === String(username||'').toLowerCase()) || null;
}

function createUser({ username, password, phone, city }){
  const email = String(username || '').toLowerCase().trim();
  if(!ADMIN_EMAILS.includes(email)){
    const err = new Error('That email is not authorized for an admin account.');
    err.status = 403;
    throw err;
  }
  const db = load();
  if(db.users.some(u => u.username.toLowerCase() === email)){
    const err = new Error('An account for that email already exists.');
    err.status = 409;
    throw err;
  }
  const user = {
    username: email, password_hash: hashPassword(password),
    phone: phone || '', city: city || '', role: 'admin',
    created_at: new Date().toISOString()
  };
  db.users.push(user);
  save(db);
  return user;
}

function verifyUser(username, password){
  const user = getUserByUsername(username);
  if(!user) return null;
  if(!verifyPassword(password, user.password_hash)) return null;
  return user;
}

// ---------- sessions ----------
function createSession(username){
  const db = load();
  const token = crypto.randomBytes(24).toString('hex');
  db.sessions.push({ token, username, created_at: new Date().toISOString() });
  save(db);
  return token;
}

function getUserByToken(token){
  if(!token) return null;
  const db = load();
  const session = db.sessions.find(s => s.token === token);
  if(!session) return null;
  return getUserByUsername(session.username);
}

// ---------- listings ----------
function getCities(){
  const db = load();
  const fromListings = [...new Set(db.listings.map(l => l.city).filter(Boolean))];
  return fromListings.length ? fromListings : DEFAULT_CITIES;
}

function publicListing(l){
  // Never expose seller contact info (phone/email) — buyers only get the owner WhatsApp button, wired client-side.
  const { seller_username, ...rest } = l;
  // Normalize photos to an array. Older listings only ever had a single `photo_data`
  // string — fold that in as a one-photo array so old and new listings render the same way.
  const photos = Array.isArray(l.photos) && l.photos.length ? l.photos
    : (l.photo_data ? [l.photo_data] : []);
  return { ...rest, seller_username, photos };
}

function getListings({ city, minPrice, maxPrice, bedrooms } = {}){
  const db = load();
  let results = db.listings.slice();
  if(city) results = results.filter(l => l.city === city);
  if(minPrice) results = results.filter(l => Number(l.price) >= Number(minPrice));
  if(maxPrice) results = results.filter(l => Number(l.price) <= Number(maxPrice));
  if(bedrooms) results = results.filter(l => Number(l.bedrooms) >= Number(bedrooms));
  results.sort((a,b) => new Date(b.created_at) - new Date(a.created_at));
  return { listings: results.map(publicListing), cities: getCities() };
}

function getListingById(id){
  const db = load();
  const l = db.listings.find(x => String(x.id) === String(id));
  return l ? publicListing(l) : null;
}

function createListing(sellerUsername, payload){
  const db = load();
  // Accept either the new `photos` array or the old single `photo_data` string, and cap at 10.
  let photos = Array.isArray(payload.photos) ? payload.photos
    : (payload.photo_data ? [payload.photo_data] : []);
  photos = photos.filter(p => typeof p === 'string' && p.startsWith('data:image/')).slice(0, 10);
  const listing = {
    id: db.nextListingId++,
    seller_username: sellerUsername,
    title: String(payload.title || '').trim(),
    photos,
    city: payload.city || '',
    price: Number(payload.price) || 0,
    bedrooms: Number(payload.bedrooms) || 0,
    bathrooms: Number(payload.bathrooms) || 0,
    area: Number(payload.area) || 0,
    description: payload.description || '',
    status: null, // null | 'sold' | 'urgent' — set later by an admin
    created_at: new Date().toISOString()
  };
  if(!listing.title || !listing.city || !listing.price){
    const err = new Error('Title, city and price are required.');
    err.status = 400;
    throw err;
  }
  db.listings.push(listing);
  save(db);
  return publicListing(listing);
}

function updateListingStatus(id, status){
  const allowed = [null, 'sold', 'urgent'];
  if(!allowed.includes(status)){
    const err = new Error('Status must be sold, urgent, or cleared.');
    err.status = 400;
    throw err;
  }
  const db = load();
  const listing = db.listings.find(x => String(x.id) === String(id));
  if(!listing){
    const err = new Error('Listing not found.');
    err.status = 404;
    throw err;
  }
  listing.status = status;
  save(db);
  return publicListing(listing);
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
