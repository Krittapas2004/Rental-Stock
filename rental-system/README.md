# Rental System

Website for renting out dresses, clothing and gear. Staff log in, add items, and enter
rental dates so everyone can see what is available and what is out.

## Run

```
npm install
npm start
```

Open http://localhost:3000. Edit `.env` first (copy of `.env.example`) to set your
`JWT_SECRET` and the first admin login. The admin is created only when the users table is empty.

To reset or change the admin password at any time via terminal:
```
npm run reset-admin [new_password]
```

## How availability works

A rental has a start date and an end date, both inclusive. An item is unavailable for any
date range that overlaps a rental with status `booked` or `picked_up`.
Example: rented 11/11/26 and returned 15/11/26 means the item is blocked 11 to 15 Nov.
Mark the rental as Returned and the item is free again straight away.

## Layout

- `src/server.js` API, login, database (SQLite, file `rental.db` created on first run)
- `public/js/api.js` fetch wrapper and helpers
- `public/js/auth.js` login / logout
- `public/js/availability.js` pick dates, see what is free
- `public/js/sell.js` create a new rental
- `public/js/orders.js` all rentals, mark picked up / returned / cancelled
- `public/js/products.js` add and edit items
- `public/js/settings.js` shop name, currency, password
