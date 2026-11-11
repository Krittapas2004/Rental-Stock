require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const newPassword = process.argv[2] || process.env.ADMIN_PASSWORD || 'admin123';
const username = process.argv[3] || process.env.ADMIN_USERNAME || 'admin';

const dbPath = path.join(__dirname, '..', 'rental.db');
const db = new Database(dbPath);

const hash = bcrypt.hashSync(newPassword, 10);
const existing = db.prepare('SELECT id FROM users WHERE username = ? COLLATE NOCASE').get(username);

if (existing) {
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(hash, existing.id);
  console.log(`Password for user "${username}" has been updated successfully to "${newPassword}".`);
} else {
  db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run(username, hash, 'admin');
  console.log(`Created new admin user "${username}" with password "${newPassword}".`);
}

