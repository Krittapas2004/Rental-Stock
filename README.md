# RentWear — Gear & Apparel Rental Management System

A web-based rental management platform for apparel, formal dresses, camping equipment, and tech gear. Built with Node.js, Express, SQLite (`better-sqlite3`), and vanilla HTML/CSS/JS.

## Features
- **Date-Range Availability Engine**: Pick rental start and return dates to immediately see what dresses or gear are available or currently rented out.
- **Rental Bookings & Schedule**: Track active rentals, return dates, customer contact info, duration, deposits, and notes.
- **One-Click Check-In / Return**: Instantly return items back to stock when customers bring them back.
- **Wardrobe & Gear Catalog**: Manage sizes, daily rental rates, deposits, stock units, and photos.
- **Rental Agreements & Slips**: Printable rental receipts with condition terms and signature lines.
- **Multi-Currency & Store Customization**: Support for THB, USD, EUR, GBP, and custom late return policies.

---

## Running Locally

1. Install Node.js (v20.6+ recommended):
   ```bash
   npm install
   ```
2. Create environment file:
   ```bash
   cp .env.example .env
   ```
3. Start the application:
   ```bash
   npm start
   ```
4. Open [http://localhost:3000](http://localhost:3000) in your browser.

---

## Important: Publishing to GitHub & Production Deployment

### 1. Publishing to GitHub
- GitHub is a **code repository**, not a database server.
- The `.gitignore` file ignores `pos.db`, `.env`, and `app.secret` so that private passwords, customer details, and secret keys are **never** publicly leaked.

### 2. Hosting the Live Website
- **GitHub Pages does not support this app**: GitHub Pages only serves static HTML/CSS files and cannot run the Node.js backend or SQLite database.
- **Use a Node.js Host with Persistent Storage**:
  - **Railway**, **Render**, or **Fly.io** (with a Persistent Volume / Disk)
  - Or a **VPS** (DigitalOcean Droplet, Linode, AWS EC2 / Lightsail)
- **Persistent Disk Configuration**:
  Set the environment variable:
  ```env
  DATA_DIR=/data
  ```
  Mount your host's persistent volume to `/data`. This ensures that your database `pos.db` is never wiped when deploying code updates or restarting the server.
