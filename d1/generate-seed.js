const fs = require('fs');
const path = require('path');

const data = JSON.parse(fs.readFileSync('portal-data.json', 'utf8'));

function escSql(str) {
  if (str == null) return "''";
  return "'" + String(str).replace(/'/g, "''") + "'";
}

const sqlLines = [];
sqlLines.push('-- Seed Data for Cloudflare D1');

// 1. Clients
data.clients.forEach(c => {
  const banner = c.bannerUrl || c.heroBanner || c.banner || c.coverUrl || '';
  const branches = JSON.stringify(c.branches || []);
  const albums = JSON.stringify(c.albums || []);
  sqlLines.push(`INSERT OR REPLACE INTO clients (id, slug, name, code, tagline, accent, anim_style, branches, albums, logo, banner_url) VALUES (${escSql(c.id)}, ${escSql((c.slug || c.id).toLowerCase())}, ${escSql(c.name)}, ${escSql(c.code)}, ${escSql(c.tagline || '')}, ${escSql(c.accent || '')}, ${escSql(c.animStyle || 'confetti')}, ${escSql(branches)}, ${escSql(albums)}, ${escSql(c.logo || '')}, ${escSql(banner)});`);
});

// 2. Reels
const validClientIds = new Set(data.clients.map(c => c.id));
data.reels.forEach(r => {
  const cid = r.c || r.clientId;
  if (!cid || !validClientIds.has(cid)) return; // Skip orphan reels with no client
  const year = Number(r.y || r.year || 2026);
  const month = Number(r.m || r.month || 11);
  const hidden = r.hidden ? 1 : 0;
  const views = Number(r.views || 0);
  const downloads = Number(r.downloads || 0);
  sqlLines.push(`INSERT OR REPLACE INTO reels (id, client_id, type, year, month, branch, album, title, date, url, file_id, dur, cover_url, hidden, status, views, downloads) VALUES (${escSql(r.id)}, ${escSql(cid)}, ${escSql(r.type || 'reel')}, ${year}, ${month}, ${escSql(r.b || r.branch || '')}, ${escSql(r.album || '')}, ${escSql(r.title)}, ${escSql(r.date || '')}, ${escSql(r.url || '')}, ${escSql(r.fileId || '')}, ${escSql(r.dur || '0:30')}, ${escSql(r.coverUrl || '')}, ${hidden}, ${escSql(r.status || 'approved')}, ${views}, ${downloads});`);
});

// 3. Settings
if (data.settings) {
  Object.keys(data.settings).forEach(key => {
    const val = typeof data.settings[key] === 'object' ? JSON.stringify(data.settings[key]) : String(data.settings[key]);
    sqlLines.push(`INSERT OR REPLACE INTO settings (key, value) VALUES (${escSql(key)}, ${escSql(val)});`);
  });
}
// Admin master passkey
sqlLines.push(`INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_passkey', 'DN@2026');`);

fs.writeFileSync('d1/seed.sql', sqlLines.join('\n'), 'utf8');
console.log('Generated d1/seed.sql with', sqlLines.length, 'queries');
