const path = require("path");
const fs = require("fs");
const express = require("express");
const session = require("express-session");
const SQLiteStore = require("connect-sqlite3")(session);
const Database = require("better-sqlite3");
const bcrypt = require("bcryptjs");
const helmet = require("helmet");
const rateLimit = require("express-rate-limit");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const DATA_DIR = process.env.DATA_DIR || (process.env.RENDER ? "/var/data" : path.join(ROOT, "data"));
fs.mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(path.join(DATA_DIR, "master-super-store.db"));
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  owner_name TEXT NOT NULL,
  shop_name TEXT NOT NULL,
  email TEXT NOT NULL UNIQUE COLLATE NOCASE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS store_data (
  user_id INTEGER PRIMARY KEY,
  data_json TEXT NOT NULL DEFAULT '{}',
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
`);

const defaultStore = (shopName) => ({
  settings: { shopName: String(shopName || "MASTER SUPER STORE").toUpperCase() },
  products: [],
  transactions: [],
  customers: [],
  suppliers: []
});

app.set("trust proxy", 1);
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", "data:"]
    }
  }
}));
app.use(express.json({ limit: "2mb" }));

app.use(session({
  store: new SQLiteStore({ db: "sessions.db", dir: DATA_DIR }),
  secret: process.env.SESSION_SECRET || "CHANGE-ME-IN-PRODUCTION-USE-A-LONG-RANDOM-SECRET",
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    maxAge: 1000 * 60 * 60 * 24 * 14
  }
}));

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 25,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many login/account attempts. Please try again later." }
});

function cleanEmail(v){ return String(v || "").trim().toLowerCase(); }
function publicUser(row){
  return {
    id: row.id,
    ownerName: row.owner_name,
    shopName: row.shop_name,
    email: row.email,
    createdAt: row.created_at
  };
}
function requireAuth(req,res,next){
  if(!req.session.userId) return res.status(401).json({error:"Please sign in first."});
  next();
}
function getUser(id){
  return db.prepare("SELECT * FROM users WHERE id=?").get(id);
}

app.post("/api/auth/register", authLimiter, async (req,res) => {
  try{
    const ownerName=String(req.body.ownerName||"").trim();
    const shopName=String(req.body.shopName||"MASTER SUPER STORE").trim().toUpperCase();
    const email=cleanEmail(req.body.email);
    const password=String(req.body.password||"");

    if(ownerName.length < 2) return res.status(400).json({error:"Enter a valid owner name."});
    if(shopName.length < 2) return res.status(400).json({error:"Enter a valid shop name."});
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({error:"Enter a valid email address."});
    if(password.length < 8 || !/[A-Za-z]/.test(password) || !/[0-9]/.test(password))
      return res.status(400).json({error:"Password must be at least 8 characters with letters and a number."});

    if(db.prepare("SELECT id FROM users WHERE email=?").get(email))
      return res.status(409).json({error:"An account with this email already exists. Please sign in."});

    const passwordHash=await bcrypt.hash(password, 12);
    const tx=db.transaction(()=>{
      const info=db.prepare("INSERT INTO users(owner_name,shop_name,email,password_hash) VALUES(?,?,?,?)")
        .run(ownerName,shopName,email,passwordHash);
      const userId=Number(info.lastInsertRowid);
      db.prepare("INSERT INTO store_data(user_id,data_json) VALUES(?,?)")
        .run(userId,JSON.stringify(defaultStore(shopName)));
      return userId;
    });
    const userId=tx();
    req.session.userId=userId;
    req.session.save(()=>{
      res.status(201).json({user:publicUser(getUser(userId))});
    });
  }catch(err){
    console.error(err);
    res.status(500).json({error:"Account could not be created."});
  }
});

app.post("/api/auth/login", authLimiter, async (req,res) => {
  const email=cleanEmail(req.body.email);
  const password=String(req.body.password||"");
  const user=db.prepare("SELECT * FROM users WHERE email=?").get(email);
  if(!user || !(await bcrypt.compare(password,user.password_hash)))
    return res.status(401).json({error:"Email or password is incorrect."});
  req.session.userId=user.id;
  req.session.save(()=>res.json({user:publicUser(user)}));
});

app.post("/api/auth/logout", (req,res) => {
  req.session.destroy(()=>res.json({ok:true}));
});

app.get("/api/health", (req,res) => {
  res.json({ok:true,service:"MASTER SUPER STORE",time:new Date().toISOString()});
});

app.get("/api/auth/me", (req,res) => {
  if(!req.session.userId) return res.status(401).json({error:"No active session."});
  const user=getUser(req.session.userId);
  if(!user) return res.status(401).json({error:"Account not found."});
  res.json({user:publicUser(user)});
});

app.get("/api/store", requireAuth, (req,res) => {
  const user=getUser(req.session.userId);
  const row=db.prepare("SELECT data_json FROM store_data WHERE user_id=?").get(user.id);
  let data=defaultStore(user.shop_name);
  if(row?.data_json){
    try{ data=JSON.parse(row.data_json); }catch(e){}
  }
  if(!data.settings) data.settings={shopName:user.shop_name};
  res.json({user:publicUser(user),data});
});

app.put("/api/store", requireAuth, (req,res) => {
  const data=req.body.data;
  if(!data || typeof data !== "object" || Array.isArray(data))
    return res.status(400).json({error:"Invalid store data."});
  const json=JSON.stringify(data);
  if(Buffer.byteLength(json,"utf8") > 2_000_000)
    return res.status(413).json({error:"Store data is too large."});
  db.prepare(`
    INSERT INTO store_data(user_id,data_json,updated_at)
    VALUES(?,?,datetime('now'))
    ON CONFLICT(user_id) DO UPDATE SET data_json=excluded.data_json, updated_at=datetime('now')
  `).run(req.session.userId,json);
  res.json({ok:true});
});

app.put("/api/profile", requireAuth, (req,res) => {
  const ownerName=String(req.body.ownerName||"").trim();
  const shopName=String(req.body.shopName||"").trim().toUpperCase();
  if(ownerName.length<2) return res.status(400).json({error:"Enter a valid owner name."});
  if(shopName.length<2) return res.status(400).json({error:"Enter a valid shop name."});
  db.prepare("UPDATE users SET owner_name=?,shop_name=?,updated_at=datetime('now') WHERE id=?")
    .run(ownerName,shopName,req.session.userId);
  res.json({user:publicUser(getUser(req.session.userId))});
});

app.use(express.static(ROOT, { extensions: ["html"] }));
app.get("*", (req,res,next) => {
  if(req.path.startsWith("/api/")) return next();
  res.sendFile(path.join(ROOT,"index.html"));
});

app.use((err,req,res,next)=>{
  console.error(err);
  res.status(500).json({error:"Server error."});
});

app.listen(PORT, ()=>console.log(`MASTER SUPER STORE running on port ${PORT}`));
