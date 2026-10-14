-- Cloudflare D1 Database Schema for Day Night Media Client Portal
-- Run: npx wrangler d1 execute <DATABASE_NAME> --file=./d1/schema.sql

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  tagline TEXT,
  accent TEXT,
  anim_style TEXT DEFAULT 'confetti',
  branches TEXT, -- JSON array
  albums TEXT,   -- JSON array
  logo TEXT,     -- Base64 or CDN URL
  banner_url TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS reels (
  id TEXT PRIMARY KEY,
  client_id TEXT NOT NULL,
  type TEXT DEFAULT 'reel',
  year INTEGER NOT NULL,
  month INTEGER NOT NULL,
  branch TEXT,
  album TEXT,
  title TEXT NOT NULL,
  date TEXT,
  url TEXT NOT NULL,
  file_id TEXT,
  dur TEXT,
  cover_url TEXT,
  hidden INTEGER DEFAULT 0,
  status TEXT DEFAULT 'approved',
  views INTEGER DEFAULT 0,
  downloads INTEGER DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- Seed Default Client (The Chennai Silks)
INSERT OR REPLACE INTO clients (id, slug, name, code, tagline, accent, anim_style, branches, albums)
VALUES (
  'tcs',
  'tcs',
  'The Chennai Silks',
  '4821',
  'Let the celebrations begin!',
  'celebrations',
  'confetti',
  '["T. Nagar", "Velachery", "Chromepet", "Thiruvallur"]',
  '["Diwali 2026", "Bridal Edit", "Festive Specials"]'
);
