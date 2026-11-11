import express from 'express';
import { createClient } from '@libsql/client';
import crypto from 'crypto';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import nodemailer from 'nodemailer';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const { PORT = 3000, ALLOW_SIGNUP = 'true', DATA_DIR = path.join(__dirname, '..') } = process.env;
const BASE_URL = (process.env.BASE_URL || `http://localhost:${PORT}`).replace(/\/$/, '');
const CURRENCIES = ['thb', 'usd', 'eur', 'gbp', 'sgd', 'aud', 'cad', 'myr'];

// Turso Cloud Database Connection
const db = createClient({
    url: process.env.TURSO_DATABASE_URL,
    authToken: process.env.TURSO_AUTH_TOKEN,
});

// Encryption & Auth secrets
const secretFile = path.join(DATA_DIR, 'app.secret');
if (!process.env.APP_SECRET && !fs.existsSync(secretFile)) {
    try {
        fs.mkdirSync(DATA_DIR, { recursive: true });
        fs.writeFileSync(secretFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
    } catch (e) {
        // Ignore if read-only filesystem
    }
}
let appSecret = process.env.APP_SECRET;
if (!appSecret && fs.existsSync(secretFile)) {
    appSecret = fs.readFileSync(secretFile, 'utf8');
}
appSecret = appSecret || crypto.randomBytes(32).toString('hex');

const KEY = crypto.createHash('sha256').update(appSecret).digest();
const hashPw = pw => {
    const s = crypto.randomBytes(16);
    return s.toString('hex') + ':' + crypto.scryptSync(pw, s, 64).toString('hex');
};
const checkPw = (pw, stored) => {
    const [s, h] = stored.split(':');
    return crypto.timingSafeEqual(crypto.scryptSync(pw, Buffer.from(s, 'hex'), 64), Buffer.from(h, 'hex'));
};
const sha = t => crypto.createHash('sha256').update(t).digest('hex');

// Initialize Database Tables
async function initDB() {
    await db.execute(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      pass TEXT NOT NULL,
      shop_name TEXT NOT NULL,
      address TEXT DEFAULT '',
      phone TEXT DEFAULT '',
      tax_rate REAL NOT NULL DEFAULT 7,
      currency TEXT NOT NULL DEFAULT 'thb',
      rental_terms TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    await db.execute(`
    CREATE TABLE IF NOT EXISTS sessions (
      token TEXT PRIMARY KEY,
      user_id INTEGER NOT NULL,
      expires INTEGER NOT NULL
    )`);

    await db.execute(`
    CREATE TABLE IF NOT EXISTS items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT 'Dresses',
      size TEXT DEFAULT '',
      price_per_day INTEGER NOT NULL,
      deposit INTEGER DEFAULT 0,
      stock INTEGER NOT NULL DEFAULT 1,
      image_url TEXT DEFAULT '',
      description TEXT DEFAULT '',
      active INTEGER NOT NULL DEFAULT 1,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    await db.execute(`
    CREATE TABLE IF NOT EXISTS rentals (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      item_id INTEGER NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT DEFAULT '',
      customer_email TEXT DEFAULT '',
      start_date TEXT NOT NULL,
      return_date TEXT NOT NULL,
      actual_return_date TEXT,
      days INTEGER NOT NULL,
      qty INTEGER NOT NULL DEFAULT 1,
      daily_rate INTEGER NOT NULL,
      total_price INTEGER NOT NULL,
      deposit_amount INTEGER DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      notes TEXT DEFAULT '',
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    await db.execute(`
    CREATE TABLE IF NOT EXISTS password_resets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      token_hash TEXT UNIQUE NOT NULL,
      expires INTEGER NOT NULL,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT DEFAULT CURRENT_TIMESTAMP
    )`);

    // Clean expired sessions & tokens
    const now = Date.now();
    await db.execute({ sql: 'DELETE FROM sessions WHERE expires < ?', args: [now] });
    await db.execute({ sql: 'DELETE FROM password_resets WHERE expires < ? OR used = 1', args: [now] });
}

await initDB();

// Email transport for password reset
const smtpHost = process.env.SMTP_HOST || '';
const smtpPort = Number(process.env.SMTP_PORT) || 587;
const smtpUser = process.env.SMTP_USER || '';
const smtpPass = process.env.SMTP_PASS || '';
const smtpFrom = process.env.SMTP_FROM || smtpUser;

let mailTransport = null;
if (smtpHost && smtpUser && smtpPass) {
    mailTransport = nodemailer.createTransport({
        host: smtpHost,
        port: smtpPort,
        secure: smtpPort === 465,
        auth: { user: smtpUser, pass: smtpPass }
    });
    mailTransport.verify().then(() => {
        console.log('✅ Email transport ready');
    }).catch(err => {
        console.warn('⚠️  Email transport failed to verify:', err.message);
    });
} else {
    console.warn('⚠️  SMTP not configured — password reset emails will be logged to console instead.');
}

// Seed default rental items for a user if they have none
async function seedRentalItems(userId) {
    const countRes = await db.execute({ sql: 'SELECT COUNT(*) as c FROM items WHERE user_id=?', args: [userId] });
    const count = Number(countRes.rows[0].c);
    if (count > 0) return;

    const sampleItems = [
        [userId, 'Emerald Silk Evening Gown', 'Dresses', 'M (US 6)', 85000, 100000, 1, '', 'Stunning floor-length satin evening gown in emerald green. Concealed back zipper, dry-clean only.'],
        [userId, 'Midnight Blue Velvet Cocktail Dress', 'Dresses', 'S (US 4)', 65000, 100000, 1, '', 'Off-shoulder luxury velvet cocktail dress with side slit.'],
        [userId, 'Boho Floral Lace Maxi Dress', 'Dresses', 'Free Size', 55000, 50000, 2, '', 'Airy bohemian lace dress with adjustable waist ribbon. Great for garden parties & photoshoots.'],
        [userId, 'Classic Black 3-Piece Tuxedo', 'Suits & Formal', '40R / L', 95000, 150000, 2, '', 'Tailored black tuxedo suit including jacket, trousers, satin vest, and matching bowtie.'],
        [userId, 'The North Face 4-Person Dome Tent', 'Camping & Outdoor', '4-Person', 45000, 100000, 3, '', 'Heavy-duty weather-resistant family dome tent with rainfly and ground tarp included.'],
        [userId, 'Sony Alpha A7 IV Camera Kit', 'Camera & Tech', 'Full Rig', 120000, 300000, 2, '', 'Includes Sony A7 IV body, 24-70mm f/2.8 GM lens, 2x batteries, and 128GB high-speed SD card.'],
        [userId, 'Osprey Atmos AG 65L Hiking Backpack', 'Camping & Outdoor', '65L / M-L', 30000, 50000, 2, '', 'Anti-Gravity suspension system hiking backpack with integrated raincover.']
    ];

    const insertedIds = [];
    for (const item of sampleItems) {
        const res = await db.execute({
            sql: `INSERT INTO items (user_id, name, category, size, price_per_day, deposit, stock, image_url, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: item
        });
        insertedIds.push(res.lastInsertRowid);
    }

    const emeraldDressId = insertedIds[0];
    const tentId = insertedIds[4];
    const tuxedoId = insertedIds[3];

    // 1. Currently active rental (User's specific example: 11/11/26 to 15/11/26)
    await db.execute({
        sql: `INSERT INTO rentals (user_id, item_id, customer_name, customer_phone, customer_email, start_date, return_date, days, qty, daily_rate, total_price, deposit_amount, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [userId, emeraldDressId, 'Emma Watson', '081-234-5678', 'emma.w@example.com', '2026-11-11', '2026-11-15', 5, 1, 85000, 425000, 100000, 'active', 'Wedding event in Hua Hin. Returning Sunday afternoon.']
    });

    // 2. An upcoming reservation
    await db.execute({
        sql: `INSERT INTO rentals (user_id, item_id, customer_name, customer_phone, customer_email, start_date, return_date, days, qty, daily_rate, total_price, deposit_amount, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [userId, tentId, 'Alex Miller', '089-987-6543', 'alex.m@example.com', '2026-11-14', '2026-11-17', 4, 1, 45000, 180000, 100000, 'reserved', 'Khao Yai camping trip with friends.']
    });

    // 3. A completed past rental
    const pastRes = await db.execute({
        sql: `INSERT INTO rentals (user_id, item_id, customer_name, customer_phone, customer_email, start_date, return_date, days, qty, daily_rate, total_price, deposit_amount, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [userId, tuxedoId, 'David Beckham', '082-555-0199', 'david@example.com', '2026-11-04', '2026-11-07', 4, 1, 95000, 380000, 150000, 'returned', 'Charity Gala dinner. Returned in pristine condition.']
    });
    await db.execute({
        sql: "UPDATE rentals SET actual_return_date=? WHERE id=?",
        args: ['2026-11-07 16:30:00', pastRes.lastInsertRowid]
    });
}

// Helper for user profiles
async function getUser(id) {
    const res = await db.execute({ sql: 'SELECT * FROM users WHERE id=?', args: [id] });
    return res.rows[0];
}
const profile = u => ({
    id: u.id,
    email: u.email,
    shop_name: u.shop_name,
    address: u.address || '',
    phone: u.phone || '',
    currency: u.currency || 'thb',
    rental_terms: u.rental_terms || ''
});
async function newSession(uid) {
    const t = crypto.randomBytes(32).toString('hex');
    await db.execute({ sql: 'INSERT INTO sessions VALUES (?,?,?)', args: [sha(t), uid, Date.now() + 30 * 864e5] });
    return t;
}

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, '../public')));

// Health check for hosting platforms
app.get('/healthz', (_req, res) => res.json({ status: 'ok' }));

// Basic rate limiter
const hits = new Map();
setInterval(() => {
    const n = Date.now();
    for (const [k, v] of hits) if (v.reset < n) hits.delete(k);
}, 6e5).unref();
const limiter = (req, res, next) => {
    const now = Date.now(), h = hits.get(req.ip);
    if (!h || h.reset < now) hits.set(req.ip, { n: 1, reset: now + 15 * 60 * 1000 });
    else if (++h.n > 50) return res.status(429).json({ error: 'Too many attempts. Try again in a few minutes.' });
    next();
};

// --- AUTH ROUTES ---
app.post('/api/register', limiter, async (req, res) => {
    if (ALLOW_SIGNUP !== 'true') return res.status(403).json({ error: 'Sign-ups are closed' });
    const email = String(req.body.email || '').trim().toLowerCase();
    const pw = String(req.body.password || '');
    const shop = String(req.body.shop_name || '').trim().slice(0, 80);

    if (!/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address' });
    if (pw.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    if (!shop) return res.status(400).json({ error: 'Enter your shop or rental business name' });

    const checkUser = await db.execute({ sql: 'SELECT 1 FROM users WHERE email=?', args: [email] });
    if (checkUser.rows.length > 0) {
        return res.status(409).json({ error: 'That email already has an account' });
    }

    const insRes = await db.execute({
        sql: 'INSERT INTO users (email, pass, shop_name) VALUES (?, ?, ?)',
        args: [email, hashPw(pw), shop]
    });
    const uid = Number(insRes.lastInsertRowid);
    await seedRentalItems(uid);

    res.json({ token: await newSession(uid) });
});

app.post('/api/login', limiter, async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    const pw = String(req.body.password || '');
    const uRes = await db.execute({ sql: 'SELECT * FROM users WHERE email=?', args: [email] });
    const u = uRes.rows[0];
    if (!u || !checkPw(pw, u.pass)) return res.status(401).json({ error: 'Wrong email or password' });

    await seedRentalItems(u.id);
    res.json({ token: await newSession(u.id) });
});

// --- FORGOT PASSWORD ---
app.post('/api/forgot-password', limiter, async (req, res) => {
    const email = String(req.body.email || '').trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ error: 'Enter a valid email address' });
    }

    const uRes = await db.execute({ sql: 'SELECT id, email, shop_name FROM users WHERE email=?', args: [email] });
    const u = uRes.rows[0];
    if (!u) {
        return res.json({ ok: true, message: 'If that email is registered, a reset link has been sent.' });
    }

    const activeResets = await db.execute({
        sql: 'SELECT COUNT(*) as c FROM password_resets WHERE user_id=? AND expires > ? AND used=0',
        args: [u.id, Date.now()]
    });
    if (Number(activeResets.rows[0].c) >= 3) {
        return res.json({ ok: true, message: 'If that email is registered, a reset link has been sent.' });
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = sha(rawToken);
    const expires = Date.now() + 60 * 60 * 1000;

    await db.execute({
        sql: 'INSERT INTO password_resets (user_id, token_hash, expires) VALUES (?, ?, ?)',
        args: [u.id, tokenHash, expires]
    });

    const resetUrl = `${BASE_URL}/reset-password.html?token=${rawToken}`;
    const emailHtml = `
        <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 520px; margin: 0 auto; padding: 24px;">
            <h2 style="color: #059669; margin-bottom: 8px;">👗🎒 RentWear</h2>
            <p>Hi <strong>${u.shop_name}</strong>,</p>
            <p>We received a request to reset the password for your account (<strong>${u.email}</strong>).</p>
            <p>Click the button below to set a new password. This link expires in <strong>1 hour</strong>.</p>
            <div style="text-align: center; margin: 28px 0;">
                <a href="${resetUrl}" style="display: inline-block; background: #059669; color: #fff; padding: 12px 32px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 15px;">
                    Reset My Password
                </a>
            </div>
            <p style="font-size: 13px; color: #64748b;">If you didn't request this, you can safely ignore this email. Your password won't change.</p>
        </div>
    `;

    try {
        if (mailTransport) {
            await mailTransport.sendMail({
                from: `"RentWear" <${smtpFrom}>`,
                to: u.email,
                subject: 'Reset your RentWear password',
                html: emailHtml
            });
        } else {
            console.log(`\n📧 PASSWORD RESET LINK: ${resetUrl}\n`);
        }
    } catch (err) {
        console.error('Failed to send reset email:', err.message);
    }

    res.json({ ok: true, message: 'If that email is registered, a reset link has been sent.' });
});

// --- RESET PASSWORD ---
app.post('/api/reset-password', limiter, async (req, res) => {
    const token = String(req.body.token || '').trim();
    const newPassword = String(req.body.password || '');

    if (!token) return res.status(400).json({ error: 'Reset token is missing' });
    if (newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });

    const tokenHash = sha(token);
    const resetRes = await db.execute({
        sql: 'SELECT * FROM password_resets WHERE token_hash=? AND used=0 AND expires > ?',
        args: [tokenHash, Date.now()]
    });
    const resetRecord = resetRes.rows[0];

    if (!resetRecord) {
        return res.status(400).json({ error: 'This reset link is invalid or has expired. Please request a new one.' });
    }

    await db.execute({ sql: 'UPDATE users SET pass=? WHERE id=?', args: [hashPw(newPassword), resetRecord.user_id] });
    await db.execute({ sql: 'UPDATE password_resets SET used=1 WHERE id=?', args: [resetRecord.id] });
    await db.execute({ sql: 'DELETE FROM sessions WHERE user_id=?', args: [resetRecord.user_id] });

    res.json({ ok: true, message: 'Password has been reset! You can now sign in.' });
});

// Auth middleware for all following /api routes
const auth = async (req, res, next) => {
    const t = (req.headers.authorization || '').replace('Bearer ', '');
    if (!t) return res.status(401).json({ error: 'Please sign in again' });

    const tokenHash = sha(t);
    const uRes = await db.execute({
        sql: 'SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token=? AND s.expires>?',
        args: [tokenHash, Date.now()]
    });
    const u = uRes.rows[0];
    if (!u) return res.status(401).json({ error: 'Please sign in again' });

    req.user = u;
    req.tokenHash = tokenHash;
    next();
};
app.use('/api', auth);

app.post('/api/logout', async (req, res) => {
    await db.execute({ sql: 'DELETE FROM sessions WHERE token=?', args: [req.tokenHash] });
    res.json({ ok: true });
});

app.get('/api/me', (req, res) => res.json(profile(req.user)));

app.put('/api/settings', async (req, res) => {
    try {
        const b = req.body;
        const shop = String(b.shop_name || '').trim().slice(0, 80);
        const addr = String(b.address || '').trim().slice(0, 200);
        const phone = String(b.phone || '').trim().slice(0, 50);
        const cur = String(b.currency || 'thb').toLowerCase();
        const terms = String(b.rental_terms || '').trim().slice(0, 1000);

        if (!shop) return res.status(400).json({ error: 'Shop name is required' });
        if (!CURRENCIES.includes(cur)) return res.status(400).json({ error: 'Unsupported currency' });

        await db.execute({
            sql: 'UPDATE users SET shop_name=?, address=?, phone=?, currency=?, rental_terms=? WHERE id=?',
            args: [shop, addr, phone, cur, terms, req.user.id]
        });
        res.json(profile(await getUser(req.user.id)));
    } catch (err) {
        console.error('Settings error:', err);
        res.status(500).json({ error: err.message });
    }
});

// Helper function to get live status of items
async function calculateItemAvailability(userId, startDate, returnDate) {
    const todayStr = new Date().toISOString().slice(0, 10);
    const sDate = startDate || todayStr;
    const rDate = returnDate || sDate;

    const itemsRes = await db.execute({
        sql: 'SELECT * FROM items WHERE user_id=? AND active=1 ORDER BY category, name',
        args: [userId]
    });
    const items = itemsRes.rows;

    const rentalsRes = await db.execute({
        sql: `
            SELECT r.*, i.name as item_name
            FROM rentals r
            JOIN items i ON i.id = r.item_id
            WHERE r.user_id = ?
              AND r.status IN ('active', 'reserved')
              AND r.start_date <= ?
              AND r.return_date >= ?
            ORDER BY r.return_date ASC
        `,
        args: [userId, rDate, sDate]
    });
    const overlappingRentals = rentalsRes.rows;

    const rentalsByItem = {};
    for (const r of overlappingRentals) {
        if (!rentalsByItem[r.item_id]) rentalsByItem[r.item_id] = [];
        rentalsByItem[r.item_id].push(r);
    }

    return items.map(item => {
        const itemRentals = rentalsByItem[item.id] || [];
        const bookedQty = itemRentals.reduce((sum, r) => sum + Number(r.qty || 1), 0);
        const availableStock = Math.max(0, Number(item.stock) - bookedQty);
        const isAvailable = availableStock > 0;

        return {
            ...item,
            booked_qty: bookedQty,
            available_stock: availableStock,
            is_available: isAvailable,
            active_rentals: itemRentals
        };
    });
}

// --- ITEM ROUTES ---
const cleanItem = b => ({
    name: String(b.name || '').trim(),
    category: String(b.category || 'Dresses').trim() || 'Dresses',
    size: String(b.size || '').trim(),
    price_per_day: Math.round(Number(b.price_per_day)),
    deposit: Math.round(Number(b.deposit || 0)),
    stock: Math.max(1, Math.round(Number(b.stock || 1))),
    image_url: String(b.image_url || '').trim(),
    description: String(b.description || '').trim()
});

const validItem = p => p.name && Number.isFinite(p.price_per_day) && p.price_per_day >= 0 && Number.isFinite(p.stock) && p.stock >= 1;

app.get('/api/items', async (req, res) => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const items = await calculateItemAvailability(req.user.id, todayStr, todayStr);
    res.json(items);
});

app.post('/api/items', async (req, res) => {
    const p = cleanItem(req.body);
    if (!validItem(p)) return res.status(400).json({ error: 'Name, daily price, and valid stock are required' });

    const r = await db.execute({
        sql: `INSERT INTO items (user_id, name, category, size, price_per_day, deposit, stock, image_url, description) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [req.user.id, p.name, p.category, p.size, p.price_per_day, p.deposit, p.stock, p.image_url, p.description]
    });

    res.json({ id: Number(r.lastInsertRowid) });
});

app.put('/api/items/:id', async (req, res) => {
    const p = cleanItem(req.body);
    if (!validItem(p)) return res.status(400).json({ error: 'Name, daily price, and valid stock are required' });

    await db.execute({
        sql: `UPDATE items SET name=?, category=?, size=?, price_per_day=?, deposit=?, stock=?, image_url=?, description=? WHERE id=? AND user_id=?`,
        args: [p.name, p.category, p.size, p.price_per_day, p.deposit, p.stock, p.image_url, p.description, req.params.id, req.user.id]
    });

    res.json({ ok: true });
});

app.delete('/api/items/:id', async (req, res) => {
    await db.execute({
        sql: 'UPDATE items SET active=0 WHERE id=? AND user_id=?',
        args: [req.params.id, req.user.id]
    });
    res.json({ ok: true });
});

// --- AVAILABILITY CHECK ROUTE ---
app.get('/api/availability', async (req, res) => {
    const { start_date, return_date } = req.query;
    if (!start_date || !return_date) {
        return res.status(400).json({ error: 'Please provide start_date and return_date (YYYY-MM-DD)' });
    }
    if (start_date > return_date) {
        return res.status(400).json({ error: 'Return date cannot be earlier than start date' });
    }

    const items = await calculateItemAvailability(req.user.id, start_date, return_date);
    res.json({ start_date, return_date, items });
});

// --- RENTALS ROUTES ---
app.get('/api/rentals', async (req, res) => {
    try {
        const { status, item_id } = req.query;
        const todayStr = new Date().toISOString().slice(0, 10);

        let query = `
            SELECT r.*, i.name as item_name, i.category as item_category, i.size as item_size,
                   i.image_url as item_image, i.price_per_day as item_daily_rate
            FROM rentals r
            JOIN items i ON i.id = r.item_id
            WHERE r.user_id = ?
        `;
        const params = [req.user.id];

        if (item_id) {
            query += ' AND r.item_id = ?';
            params.push(item_id);
        }

        if (status === 'active') {
            query += " AND r.status = 'active'";
        } else if (status === 'due_today') {
            query += " AND r.status = 'active' AND r.return_date = ?";
            params.push(todayStr);
        } else if (status === 'overdue') {
            query += " AND r.status = 'active' AND r.return_date < ?";
            params.push(todayStr);
        } else if (status === 'reserved') {
            query += " AND r.status = 'reserved'";
        } else if (status === 'returned') {
            query += " AND r.status = 'returned'";
        }

        query += ` ORDER BY CASE WHEN r.status = 'active' AND r.return_date < '${todayStr}' THEN 0 WHEN r.status = 'active' THEN 1 WHEN r.status = 'reserved' THEN 2 ELSE 3 END, r.return_date ASC, r.id DESC`;

        const rowsRes = await db.execute({ sql: query, args: params });
        res.json(rowsRes.rows);
    } catch (err) {
        console.error('Rentals fetch error:', err);
        res.status(500).json({ error: err.message });
    }
});

app.post('/api/rentals', async (req, res) => {
    const b = req.body;
    const itemId = Number(b.item_id);
    const customerName = String(b.customer_name || '').trim();
    const customerPhone = String(b.customer_phone || '').trim();
    const customerEmail = String(b.customer_email || '').trim();
    const startDate = String(b.start_date || '').trim();
    const returnDate = String(b.return_date || '').trim();
    const qty = Math.max(1, Number(b.qty || 1));
    const notes = String(b.notes || '').trim();

    if (!itemId) return res.status(400).json({ error: 'Please select an item' });
    if (!customerName) return res.status(400).json({ error: 'Customer name is required' });
    if (!startDate || !returnDate) return res.status(400).json({ error: 'Start date and return date are required' });
    if (startDate > returnDate) return res.status(400).json({ error: 'Return date cannot be earlier than start date' });

    const itemRes = await db.execute({ sql: 'SELECT * FROM items WHERE id=? AND user_id=? AND active=1', args: [itemId, req.user.id] });
    const item = itemRes.rows[0];
    if (!item) return res.status(404).json({ error: 'Item not found' });

    const msDiff = new Date(returnDate + 'T00:00:00Z') - new Date(startDate + 'T00:00:00Z');
    const days = Math.max(1, Math.round(msDiff / (1000 * 60 * 60 * 24)) + 1);

    const dailyRate = item.price_per_day;
    const totalPrice = b.total_price != null ? Math.round(Number(b.total_price)) : dailyRate * days * qty;
    const depositAmount = b.deposit_amount != null ? Math.round(Number(b.deposit_amount)) : item.deposit * qty;

    const overlapRes = await db.execute({
        sql: `SELECT SUM(qty) as booked FROM rentals WHERE user_id = ? AND item_id = ? AND status IN ('active', 'reserved') AND start_date <= ? AND return_date >= ?`,
        args: [req.user.id, itemId, returnDate, startDate]
    });

    const bookedUnits = overlapRes.rows[0] && overlapRes.rows[0].booked ? Number(overlapRes.rows[0].booked) : 0;
    const availableUnits = Number(item.stock) - bookedUnits;

    if (qty > availableUnits) {
        return res.status(400).json({
            error: `Only ${availableUnits} unit(s) of "${item.name}" available between ${startDate} and ${returnDate}.`
        });
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    const initialStatus = startDate <= todayStr ? 'active' : 'reserved';

    const insertRes = await db.execute({
        sql: `INSERT INTO rentals (user_id, item_id, customer_name, customer_phone, customer_email, start_date, return_date, days, qty, daily_rate, total_price, deposit_amount, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [req.user.id, itemId, customerName, customerPhone, customerEmail, startDate, returnDate, days, qty, dailyRate, totalPrice, depositAmount, initialStatus, notes]
    });

    const createdRes = await db.execute({
        sql: `SELECT r.*, i.name as item_name, i.category as item_category, i.size as item_size, i.image_url as item_image FROM rentals r JOIN items i ON i.id = r.item_id WHERE r.id = ?`,
        args: [insertRes.lastInsertRowid]
    });

    res.json(createdRes.rows[0]);
});

app.put('/api/rentals/:id/return', async (req, res) => {
    const rentalRes = await db.execute({ sql: 'SELECT * FROM rentals WHERE id=? AND user_id=?', args: [req.params.id, req.user.id] });
    if (rentalRes.rows.length === 0) return res.status(404).json({ error: 'Rental not found' });

    const nowStr = new Date().toISOString().replace('T', ' ').slice(0, 19);
    await db.execute({
        sql: "UPDATE rentals SET status = 'returned', actual_return_date = ? WHERE id = ? AND user_id = ?",
        args: [nowStr, req.params.id, req.user.id]
    });

    res.json({ ok: true, actual_return_date: nowStr });
});

app.put('/api/rentals/:id/status', async (req, res) => {
    const { status } = req.body;
    if (!['active', 'reserved', 'returned', 'cancelled'].includes(status)) {
        return res.status(400).json({ error: 'Invalid status' });
    }

    const nowStr = status === 'returned' ? new Date().toISOString().replace('T', ' ').slice(0, 19) : null;
    await db.execute({
        sql: "UPDATE rentals SET status = ?, actual_return_date = CASE WHEN ? = 'returned' THEN ? ELSE actual_return_date END WHERE id = ? AND user_id = ?",
        args: [status, status, nowStr, req.params.id, req.user.id]
    });

    res.json({ ok: true });
});

app.delete('/api/rentals/:id', async (req, res) => {
    await db.execute({ sql: 'DELETE FROM rentals WHERE id=? AND user_id=?', args: [req.params.id, req.user.id] });
    res.json({ ok: true });
});

// --- DASHBOARD STATS ---
app.get('/api/dashboard', async (req, res) => {
    const todayStr = new Date().toISOString().slice(0, 10);
    const userId = req.user.id;

    const totalItemsRes = await db.execute({ sql: 'SELECT COUNT(*) as c FROM items WHERE user_id=? AND active=1', args: [userId] });
    const totalItems = Number(totalItemsRes.rows[0].c);

    const activeRes = await db.execute({ sql: "SELECT COUNT(*) as c, SUM(qty) as total_qty FROM rentals WHERE user_id=? AND status='active'", args: [userId] });
    const activeData = activeRes.rows[0];

    const dueTodayRes = await db.execute({ sql: "SELECT COUNT(*) as c FROM rentals WHERE user_id=? AND status='active' AND return_date = ?", args: [userId, todayStr] });
    const dueToday = Number(dueTodayRes.rows[0].c);

    const overdueRes = await db.execute({ sql: "SELECT COUNT(*) as c FROM rentals WHERE user_id=? AND status='active' AND return_date < ?", args: [userId, todayStr] });
    const overdue = Number(overdueRes.rows[0].c);

    const upcomingRes = await db.execute({ sql: "SELECT COUNT(*) as c FROM rentals WHERE user_id=? AND status='reserved' AND start_date >= ?", args: [userId, todayStr] });
    const upcoming = Number(upcomingRes.rows[0].c);

    res.json({
        total_items: totalItems,
        currently_out: Number(activeData.total_qty || 0),
        due_today: dueToday,
        overdue: overdue,
        upcoming: upcoming,
        today: todayStr
    });
});

app.get('*', (_req, res) => {
    res.sendFile(path.join(__dirname, '../public/index.html'));
});

app.listen(PORT, () => console.log(`Rental System running at ${BASE_URL} (sign-ups: ${ALLOW_SIGNUP === 'true' ? 'open' : 'closed'})`));