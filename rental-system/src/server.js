require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const express = require('express');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const db = new Database(path.join(__dirname, '..', 'rental.db'));
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY, username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'staff');
CREATE TABLE IF NOT EXISTS products (
  id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'Dress',
  size TEXT DEFAULT '', price_per_day REAL NOT NULL DEFAULT 0,
  description TEXT DEFAULT '', active INTEGER NOT NULL DEFAULT 1);
CREATE TABLE IF NOT EXISTS orders (
  id INTEGER PRIMARY KEY, customer_name TEXT NOT NULL, phone TEXT DEFAULT '',
  start_date TEXT NOT NULL, end_date TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'booked', notes TEXT DEFAULT '',
  total REAL NOT NULL DEFAULT 0, created_by TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')));
CREATE TABLE IF NOT EXISTS order_items (
  order_id INTEGER NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
  product_id INTEGER NOT NULL REFERENCES products(id),
  price_per_day REAL NOT NULL, PRIMARY KEY (order_id, product_id));
CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT);
`);

const seed = db.prepare('INSERT OR IGNORE INTO settings (key, value) VALUES (?, ?)');
seed.run('shop_name', 'My Rental Shop');
seed.run('currency', '฿');

if (db.prepare('SELECT COUNT(*) c FROM users').get().c === 0) {
  const u = process.env.ADMIN_USERNAME || 'admin';
  const p = process.env.ADMIN_PASSWORD || 'admin123';
  db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)')
    .run(u, bcrypt.hashSync(p, 10), 'admin');
  console.log(`Created admin user "${u}"`);
}

const ACTIVE = "('booked','picked_up')";
const isDate = (s) => /^\d{4}-\d{2}-\d{2}$/.test(s || '') && !isNaN(Date.parse(s));
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / 864e5) + 1;

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  try {
    req.user = jwt.verify(h.replace('Bearer ', ''), SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Please log in again.' });
  }
}
const adminOnly = (req, res, next) =>
  req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admin only.' });

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

/* ---------- Auth ---------- */
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE username = ? COLLATE NOCASE').get((username || '').trim());
  if (!user || !bcrypt.compareSync(password || '', user.password_hash))
    return res.status(401).json({ error: 'Wrong username or password.' });
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET, { expiresIn: '12h' });
  res.json({ token, user: { username: user.username, role: user.role } });
});

app.get('/api/auth/me', auth, (req, res) => res.json({ user: req.user }));

app.post('/api/auth/password', auth, (req, res) => {
  const { current, next: nextPw } = req.body || {};
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!bcrypt.compareSync(current || '', user.password_hash))
    return res.status(400).json({ error: 'Current password is wrong.' });
  if (!nextPw || nextPw.length < 6)
    return res.status(400).json({ error: 'New password needs at least 6 characters.' });
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(bcrypt.hashSync(nextPw, 10), user.id);
  res.json({ ok: true });
});

/* ---------- Items ---------- */
app.get('/api/products', auth, (req, res) => {
  res.json(db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY category, name').all());
});

function readProduct(b) {
  const name = (b.name || '').trim();
  if (!name) return { error: 'Item name is required.' };
  const price = Number(b.price_per_day);
  if (isNaN(price) || price < 0) return { error: 'Price per day must be a number.' };
  return { v: [name, (b.category || 'Dress').trim(), (b.size || '').trim(), price, (b.description || '').trim()] };
}

app.post('/api/products', auth, adminOnly, (req, res) => {
  const { v, error } = readProduct(req.body || {});
  if (error) return res.status(400).json({ error });
  const r = db.prepare('INSERT INTO products (name, category, size, price_per_day, description) VALUES (?,?,?,?,?)').run(...v);
  res.json({ id: r.lastInsertRowid });
});

app.put('/api/products/:id', auth, adminOnly, (req, res) => {
  const { v, error } = readProduct(req.body || {});
  if (error) return res.status(400).json({ error });
  db.prepare('UPDATE products SET name=?, category=?, size=?, price_per_day=?, description=? WHERE id=?').run(...v, req.params.id);
  res.json({ ok: true });
});

app.delete('/api/products/:id', auth, adminOnly, (req, res) => {
  const busy = db.prepare(`SELECT COUNT(*) c FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE oi.product_id = ? AND o.status IN ${ACTIVE}`).get(req.params.id).c;
  if (busy) return res.status(409).json({ error: 'This item has open rentals. Return or cancel them first.' });
  db.prepare('UPDATE products SET active = 0 WHERE id = ?').run(req.params.id);
  res.json({ ok: true });
});

/* ---------- Availability ---------- */
function conflictsFor(start, end) {
  return db.prepare(`
    SELECT oi.product_id, o.id AS order_id, o.customer_name, o.start_date, o.end_date, o.status
    FROM order_items oi JOIN orders o ON o.id = oi.order_id
    WHERE o.status IN ${ACTIVE} AND o.start_date <= ? AND o.end_date >= ?`).all(end, start);
}

app.get('/api/availability', auth, (req, res) => {
  const { start, end } = req.query;
  if (!isDate(start) || !isDate(end) || end < start)
    return res.status(400).json({ error: 'Pick a start date and an end date that is the same or later.' });
  const conflicts = conflictsFor(start, end);
  const items = db.prepare('SELECT * FROM products WHERE active = 1 ORDER BY category, name').all().map((p) => {
    const c = conflicts.filter((x) => x.product_id === p.id);
    return { ...p, available: c.length === 0, conflicts: c };
  });
  res.json(items);
});

/* ---------- Rentals ---------- */
app.get('/api/orders', auth, (req, res) => {
  const rows = db.prepare('SELECT * FROM orders ORDER BY start_date DESC, id DESC').all();
  const items = db.prepare(`SELECT oi.order_id, p.name, p.size FROM order_items oi
    JOIN products p ON p.id = oi.product_id`).all();
  res.json(rows.map((o) => ({ ...o, items: items.filter((i) => i.order_id === o.id) })));
});

app.post('/api/orders', auth, (req, res) => {
  const { customer_name, phone, start_date, end_date, notes, product_ids } = req.body || {};
  if (!(customer_name || '').trim()) return res.status(400).json({ error: 'Customer name is required.' });
  if (!isDate(start_date) || !isDate(end_date) || end_date < start_date)
    return res.status(400).json({ error: 'Check the rental dates.' });
  if (!Array.isArray(product_ids) || !product_ids.length)
    return res.status(400).json({ error: 'Pick at least one item.' });

  const create = db.transaction(() => {
    const taken = conflictsFor(start_date, end_date);
    const clash = taken.filter((c) => product_ids.includes(c.product_id));
    if (clash.length) {
      const names = clash.map((c) => db.prepare('SELECT name FROM products WHERE id=?').get(c.product_id).name);
      const err = new Error(`Not available for those dates: ${[...new Set(names)].join(', ')}.`);
      err.status = 409;
      throw err;
    }
    const prods = product_ids.map((id) => db.prepare('SELECT * FROM products WHERE id = ? AND active = 1').get(id));
    if (prods.some((p) => !p)) throw Object.assign(new Error('An item no longer exists.'), { status: 400 });
    const n = days(start_date, end_date);
    const total = prods.reduce((s, p) => s + p.price_per_day * n, 0);
    const o = db.prepare(`INSERT INTO orders (customer_name, phone, start_date, end_date, notes, total, created_by)
      VALUES (?,?,?,?,?,?,?)`).run(customer_name.trim(), (phone || '').trim(), start_date, end_date, (notes || '').trim(), total, req.user.username);
    const ins = db.prepare('INSERT INTO order_items (order_id, product_id, price_per_day) VALUES (?,?,?)');
    prods.forEach((p) => ins.run(o.lastInsertRowid, p.id, p.price_per_day));
    return o.lastInsertRowid;
  });

  try {
    res.json({ id: create() });
  } catch (e) {
    res.status(e.status || 500).json({ error: e.message });
  }
});

app.patch('/api/orders/:id/status', auth, (req, res) => {
  const { status } = req.body || {};
  if (!['booked', 'picked_up', 'returned', 'cancelled'].includes(status))
    return res.status(400).json({ error: 'Unknown status.' });
  db.prepare('UPDATE orders SET status = ? WHERE id = ?').run(status, req.params.id);
  res.json({ ok: true });
});

/* ---------- Settings ---------- */
app.get('/api/settings', auth, (req, res) => {
  const out = {};
  db.prepare('SELECT key, value FROM settings').all().forEach((r) => (out[r.key] = r.value));
  res.json(out);
});

app.put('/api/settings', auth, adminOnly, (req, res) => {
  const up = db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  ['shop_name', 'currency'].forEach((k) => {
    if (typeof req.body[k] === 'string') up.run(k, req.body[k].trim());
  });
  res.json({ ok: true });
});

const port = process.env.PORT || 3000;
app.listen(port, () => console.log(`Rental system running at http://localhost:${port}`));
