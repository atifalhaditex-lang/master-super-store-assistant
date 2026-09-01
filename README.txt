MASTER SUPER STORE — FINAL BACKEND EDITION

This edition DOES NOT use Supabase.

Backend:
- Node.js + Express
- SQLite database (auto-created in /data/master-super-store.db)
- Passwords hashed with bcrypt
- Server-side login sessions stored in SQLite
- Every account has its own profile and its own store_data row
- Returning users log in with the same email/password and see their own profile/shop/data
- Account owner name + email appear in the top header after login
- Shop name is stored per account and can be changed in Settings
- New account logs in immediately; no email confirmation is required

Run locally:
1. Install Node.js 20+
2. Open this folder in terminal
3. npm install
4. Copy .env.example to .env and set a strong SESSION_SECRET
5. npm start
6. Open http://localhost:3000

IMPORTANT:
GitHub Pages cannot run server.js or SQLite. This full-stack version must be deployed on a Node.js host such as Render, Railway, VPS, or similar persistent server hosting.
For SQLite production hosting, keep the /data folder on persistent disk/storage.

Files:
index.html
style.css
app.js
server.js
package.json
.env.example
.gitignore

Database tables:
users      -> owner name, shop name, email, password hash
store_data -> one private JSON store database per user
sessions   -> login sessions (created by connect-sqlite3)

Security:
- Password hashes only; plain passwords are never stored
- HttpOnly SameSite session cookie
- Auth rate limiting
- Helmet security headers
- User store endpoints require authenticated session
