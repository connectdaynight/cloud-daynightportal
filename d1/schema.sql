-- Cloudflare D1 Database Schema for Day Night Media Client Portal
-- Production Database: daynight-portal-db (8e86b2d4-2a65-4145-a473-46fe37633c5a)

CREATE TABLE IF NOT EXISTS clients (
  id TEXT PRIMARY KEY,
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  tagline TEXT,
  accent TEXT,
  anim_style TEXT DEFAULT 'confetti',
  branches TEXT,       -- JSON array of branch names e.g. ["T. Nagar", "Velachery"]
  albums TEXT,         -- JSON array of collection names e.g. ["Diwali 2026", "Bridal"]
  logo TEXT,           -- Logo URL or path
  banner_url TEXT,     -- 16:9 Hero Banner URL
  branch_covers TEXT DEFAULT '{}', -- JSON map of branch to cover URL
  album_covers TEXT DEFAULT '{}',  -- JSON map of album to cover URL
  status TEXT DEFAULT 'active',    -- 'active' | 'archived'
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
  status TEXT DEFAULT 'approved', -- 'approved' | 'rejected' | 'pending'
  views INTEGER DEFAULT 0,
  downloads INTEGER DEFAULT 0,
  comments TEXT DEFAULT '[]',     -- JSON array of client feedback and comments
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (client_id) REFERENCES clients(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

CREATE TABLE IF NOT EXISTS comments (
  id TEXT PRIMARY KEY,
  reel_id TEXT NOT NULL,
  client_id TEXT NOT NULL,
  author TEXT NOT NULL,
  text TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (reel_id) REFERENCES reels(id) ON DELETE CASCADE
);
