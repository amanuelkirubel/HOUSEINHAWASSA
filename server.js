require('dotenv').config();
const express = require('express');
const cors = require('cors');
const path = require('path');
const bcrypt = require('bcryptjs');
const { pool, initSchema } = require('./db');
const { signToken, requireAuth } = require('./auth');

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

const CITIES = ["Addis Ababa","Hawassa","Bahir Dar","Mekelle","Adama","Dire Dawa","Gondar","Jimma"];

// ---------- AUTH ----------

app.post('/api/auth/signup', async (req, res) => {
  try {
    const { username, password, role, phone, city } = req.body;
    if (!username || !password || !role) {
      return res.status(400).json({ error: 'Username, password, and role are required.' });
    }
    if (!['buyer', 'seller'].includes(role)) {
      return res.status(400).json({ error: 'Role must be buyer or seller.' });
    }
    const existing = await pool.query('SELECT id FROM users WHERE username=$1', [username]);
    if (existing.rows.length) {
      return res.status(409).json({ error: 'That username is already taken.' });
    }
    const hash = await bcrypt.hash(password, 10);
    await pool.query(
      'INSERT INTO users (username, password_hash, role, phone, city) VALUES ($1,$2,$3,$4,$5)',
      [username, hash, role, phone || '', city || '']
    );
    const user = { username, role, phone: phone || '', city: city || '' };
    res.json({ token: signToken(user), user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not create account.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body;
    const result = await pool.query('SELECT * FROM users WHERE username=$1', [username]);
    const row = result.rows[0];
    if (!row) return res.status(401).json({ error: 'Username or password is incorrect.' });
    const ok = await bcrypt.compare(password, row.password_hash);
    if (!ok) return res.status(401).json({ error: 'Username or password is incorrect.' });
    const user = { username: row.username, role: row.role, phone: row.phone, city: row.city };
    res.json({ token: signToken(user), user });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Login failed.' });
  }
});

app.get('/api/auth/me', requireAuth, async (req, res) => {
  res.json({ user: req.user });
});

// ---------- LISTINGS ----------

app.get('/api/listings', async (req, res) => {
  try {
    const { city, minPrice, maxPrice, bedrooms } = req.query;
    const clauses = [];
    const params = [];
    if (city) { params.push(city); clauses.push(`city = $${params.length}`); }
    if (minPrice) { params.push(minPrice); clauses.push(`price >= $${params.length}`); }
    if (maxPrice) { params.push(maxPrice); clauses.push(`price <= $${params.length}`); }
    if (bedrooms) { params.push(bedrooms); clauses.push(`bedrooms >= $${params.length}`); }
    const where = clauses.length ? 'WHERE ' + clauses.join(' AND ') : '';
    const result = await pool.query(
      `SELECT * FROM listings ${where} ORDER BY created_at DESC`,
      params
    );
    res.json({ listings: result.rows, cities: CITIES });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not load listings.' });
  }
});

app.get('/api/listings/:id', async (req, res) => {
  const result = await pool.query('SELECT * FROM listings WHERE id=$1', [req.params.id]);
  if (!result.rows[0]) return res.status(404).json({ error: 'Listing not found.' });
  res.json({ listing: result.rows[0] });
});

app.post('/api/listings', requireAuth, async (req, res) => {
  try {
    if (req.user.role !== 'seller') {
      return res.status(403).json({ error: 'Only sellers can list houses.' });
    }
    const { title, city, price, bedrooms, bathrooms, area, description } = req.body;
    if (!title || !city || !price) {
      return res.status(400).json({ error: 'Title, city, and price are required.' });
    }
    const icons = ['🏡', '🏠', '🏘️'];
    const icon = icons[Math.floor(Math.random() * icons.length)];
    const result = await pool.query(
      `INSERT INTO listings (title, city, price, bedrooms, bathrooms, area, description, icon, seller_username)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [title, city, price, bedrooms || 0, bathrooms || 0, area || 0, description || '', icon, req.user.username]
    );
    res.json({ listing: result.rows[0] });
  } catch (e) {
    console.error(e);
    res.status(500).json({ error: 'Could not create listing.' });
  }
});

// ---------- MESSAGES ----------

app.get('/api/messages/:listingId/:buyer', requireAuth, async (req, res) => {
  const { listingId, buyer } = req.params;
  const listing = (await pool.query('SELECT * FROM listings WHERE id=$1', [listingId])).rows[0];
  if (!listing) return res.status(404).json({ error: 'Listing not found.' });
  const allowed = req.user.username === buyer || req.user.username === listing.seller_username;
  if (!allowed) return res.status(403).json({ error: 'Not your conversation.' });
  const msgs = await pool.query(
    'SELECT * FROM messages WHERE listing_id=$1 AND buyer_username=$2 ORDER BY created_at ASC',
    [listingId, buyer]
  );
  res.json({ messages: msgs.rows, listingTitle: listing.title });
});

app.post('/api/messages/:listingId/:buyer', requireAuth, async (req, res) => {
  const { listingId, buyer } = req.params;
  const { text } = req.body;
  if (!text || !text.trim()) return res.status(400).json({ error: 'Message cannot be empty.' });
  const listing = (await pool.query('SELECT * FROM listings WHERE id=$1', [listingId])).rows[0];
  if (!listing) return res.status(404).json({ error: 'Listing not found.' });
  const allowed = req.user.username === buyer || req.user.username === listing.seller_username;
  if (!allowed) return res.status(403).json({ error: 'Not your conversation.' });
  const result = await pool.query(
    'INSERT INTO messages (listing_id, buyer_username, sender, text) VALUES ($1,$2,$3,$4) RETURNING *',
    [listingId, buyer, req.user.username, text.trim()]
  );
  res.json({ message: result.rows[0] });
});

app.get('/api/inbox', requireAuth, async (req, res) => {
  const result = await pool.query(
    `SELECT DISTINCT m.listing_id, m.buyer_username, l.title AS listing_title, l.seller_username
     FROM messages m JOIN listings l ON l.id = m.listing_id
     WHERE m.buyer_username = $1 OR l.seller_username = $1
     ORDER BY m.listing_id DESC`,
    [req.user.username]
  );
  res.json({ threads: result.rows });
});

// Fallback to index.html for the frontend
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

const PORT = process.env.PORT || 3000;
initSchema()
  .then(() => {
    app.listen(PORT, () => console.log(`YeBet server running on port ${PORT}`));
  })
  .catch((e) => {
    console.error('Failed to initialize database:', e);
    process.exit(1);
  });
