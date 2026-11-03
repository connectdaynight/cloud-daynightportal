/**
 * Cloudflare Pages Function: /api/save
 * Authoritative batch sync and single action handler saving directly into Cloudflare D1
 */

export async function onRequestPost(context) {
  const { request, env } = context;
  try {
    const payload = await request.json();

    if (!env.DB) {
      return new Response(JSON.stringify({ success: false, error: "Cloudflare D1 binding missing" }), {
        status: 503,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    if (payload) {
      // Direct Single Action: Update Reel Approval Status
      if (payload.action === 'updateReelStatus' || payload.action === 'updateStatus') {
        const reelId = payload.reelId || payload.id;
        const status = payload.status;
        if (reelId && status) {
          await env.DB.prepare("UPDATE reels SET status = ? WHERE id = ?").bind(status, reelId).run();
          return new Response(JSON.stringify({ success: true, message: `Reel status updated to ${status} in D1` }), {
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
          });
        }
      }

      // Direct Single Action: Save Settings
      if (payload.action === 'saveSettings' && payload.settings) {
        for (const [key, val] of Object.entries(payload.settings)) {
          const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
          await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind(key, strVal).run();
        }
        return new Response(JSON.stringify({ success: true, message: "Settings saved to D1" }), {
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }

      // 1. Sync Settings (Agency branding, portal controls, social links, intro speed)
      if (payload.settings && typeof payload.settings === 'object') {
        for (const [key, val] of Object.entries(payload.settings)) {
          const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
          await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind(key, strVal).run();
        }
      }

      // 2. Sync Clients (Including Hero Banners, Store Branch Covers, Album Covers)
      if (Array.isArray(payload.clients) && payload.clients.length > 0) {
        for (const c of payload.clients) {
          if (!c.id || !c.name || !c.code) continue;
          const banner = c.bannerUrl || c.heroBanner || c.banner || c.coverUrl || '';
          const branchesJson = JSON.stringify(c.branches || []);
          const albumsJson = JSON.stringify(c.albums || []);
          const branchCoversJson = JSON.stringify(c.branchCovers || {});
          const albumCoversJson = JSON.stringify(c.albumCovers || {});

          await env.DB.prepare(`
            INSERT OR REPLACE INTO clients (id, slug, name, code, tagline, accent, anim_style, branches, albums, logo, banner_url, branch_covers, album_covers, status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            c.id,
            (c.slug || c.id).toLowerCase(),
            c.name,
            c.code,
            c.tagline || '',
            c.accent || '',
            c.animStyle || 'confetti',
            branchesJson,
            albumsJson,
            c.logo || '',
            banner,
            branchCoversJson,
            albumCoversJson,
            c.status || 'active'
          ).run();
        }
      }

      // 3. Sync Reels (Including Comments, Status, Views, Downloads)
      if (Array.isArray(payload.reels) && payload.reels.length > 0) {
        for (const r of payload.reels) {
          const cid = r.c || r.clientId;
          if (!r.id || !cid || !r.title) continue;
          const commentsJson = JSON.stringify(r.comments || []);

          await env.DB.prepare(`
            INSERT OR REPLACE INTO reels (id, client_id, type, year, month, branch, album, title, date, url, file_id, dur, cover_url, hidden, status, views, downloads, comments)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `).bind(
            r.id,
            cid,
            r.type || 'reel',
            Number(r.y || r.year || 2026),
            Number(r.m || r.month || 11),
            r.b || r.branch || '',
            r.album || '',
            r.title,
            r.date || '',
            r.url || '',
            r.fileId || '',
            r.dur || '0:30',
            r.coverUrl || '',
            r.hidden ? 1 : 0,
            r.status || 'approved',
            Number(r.views || 0),
            Number(r.downloads || 0),
            commentsJson
          ).run();
        }
      }
    }

    return new Response(JSON.stringify({ success: true, savedAt: Date.now() }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  } catch(e) {
    return new Response(JSON.stringify({ success: false, error: e.message }), {
      status: 400,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, x-admin-passkey"
    }
  });
}
