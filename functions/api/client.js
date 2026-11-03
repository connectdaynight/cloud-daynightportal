/**
 * Cloudflare Pages Function: /api/client
 * Authoritative backend for client accounts, reel metadata, comments, approval status, and admin settings.
 * Backed by Cloudflare D1 SQLite database (daynight-portal-db).
 */

const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycbxTaYOdXlJ8Sy-yfbh68gq4iJn1ThlQXoTY83Bc75tlPYcQrbz1lv_WWfDySu4CYaGE/exec";
const DEFAULT_DRIVE_FOLDER_URL = "https://drive.google.com/drive/folders/1O6i07d2NeWQUo22HTlg2DogkrJ6zLxCn";

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);

  // Fast RTT Edge Latency Probe (< 5ms response)
  if (url.searchParams.get('probe') === '1') {
    return new Response(JSON.stringify({ pong: 1, ts: Date.now() }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-store, no-cache, must-revalidate"
      }
    });
  }

  const slug = url.searchParams.get('slug') || url.searchParams.get('c');
  const code = url.searchParams.get('code');

  if (!env.DB) {
    return new Response(JSON.stringify({ success: false, error: "Cloudflare D1 database binding missing" }), {
      status: 503,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  const env_config = {
    gasUrl: env.GAS_URL || DEFAULT_GAS_URL,
    driveFolderUrl: env.GOOGLE_DRIVE_FOLDER_URL || DEFAULT_DRIVE_FOLDER_URL
  };

  try {
    // 1. Fetch Global Portal Settings
    const settingsRows = await env.DB.prepare("SELECT key, value FROM settings").all();
    const settings = {};
    (settingsRows.results || []).forEach(s => {
      try {
        settings[s.key] = JSON.parse(s.value);
      } catch (_) {
        settings[s.key] = s.value;
      }
    });

    // 2. If no specific client requested, return ALL clients and ALL reels (used by Admin Panel & Overview)
    if (!slug && !code) {
      const allClientsQuery = await env.DB.prepare("SELECT * FROM clients ORDER BY name ASC").all();
      const allReelsQuery = await env.DB.prepare("SELECT * FROM reels ORDER BY date DESC").all();

      const clients = (allClientsQuery.results || []).map(c => {
        let branches = [];
        let albums = [];
        let branchCovers = {};
        let albumCovers = {};
        try { branches = JSON.parse(c.branches || "[]"); } catch(_) {}
        try { albums = JSON.parse(c.albums || "[]"); } catch(_) {}
        try { branchCovers = JSON.parse(c.branch_covers || "{}"); } catch(_) {}
        try { albumCovers = JSON.parse(c.album_covers || "{}"); } catch(_) {}

        return {
          id: c.id,
          slug: c.slug,
          name: c.name,
          code: c.code,
          tagline: c.tagline || '',
          accent: c.accent || '',
          animStyle: c.anim_style || 'confetti',
          logo: c.logo || '',
          bannerUrl: c.banner_url || '',
          banner: c.banner_url || '',
          heroBanner: c.banner_url || '',
          coverUrl: c.banner_url || '',
          branches,
          albums,
          branchCovers,
          albumCovers,
          status: c.status || 'active'
        };
      });

      const reels = (allReelsQuery.results || []).map(r => {
        let comments = [];
        try { comments = JSON.parse(r.comments || "[]"); } catch(_) {}
        return {
          id: r.id,
          c: r.client_id,
          clientId: r.client_id,
          type: r.type || 'reel',
          y: Number(r.year || 2026),
          year: Number(r.year || 2026),
          m: Number(r.month != null ? r.month : (r.date ? new Date(r.date).getMonth() : 10)),
          month: Number(r.month != null ? r.month : (r.date ? new Date(r.date).getMonth() : 10)),
          b: r.branch || '',
          branch: r.branch || '',
          album: r.album || '',
          title: r.title,
          date: r.date || '',
          url: r.url,
          fileId: r.file_id || '',
          dur: r.dur || '0:30',
          coverUrl: r.cover_url || '',
          hidden: Boolean(r.hidden),
          status: r.status || 'approved',
          views: Number(r.views || 0),
          downloads: Number(r.downloads || 0),
          comments
        };
      });

      return new Response(JSON.stringify({
        success: true,
        clients,
        reels,
        settings,
        env_config
      }), {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Cache-Control": "no-cache, no-store, must-revalidate"
        }
      });
    }

    // 3. Specific Client Query (by slug or access PIN code)
    let client = null;
    if (slug) {
      client = await env.DB.prepare("SELECT * FROM clients WHERE slug = ? OR id = ?").bind(slug.toLowerCase(), slug.toLowerCase()).first();
    } else if (code) {
      client = await env.DB.prepare("SELECT * FROM clients WHERE code = ?").bind(code).first();
    }

    if (!client) {
      return new Response(JSON.stringify({ success: false, error: "Client not found in Cloudflare D1" }), {
        status: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    // Parse client JSON fields safely
    try { client.branches = JSON.parse(client.branches || "[]"); } catch(_) { client.branches = []; }
    try { client.albums = JSON.parse(client.albums || "[]"); } catch(_) { client.albums = []; }
    try { client.branchCovers = JSON.parse(client.branch_covers || "{}"); } catch(_) { client.branchCovers = {}; }
    try { client.albumCovers = JSON.parse(client.album_covers || "{}"); } catch(_) { client.albumCovers = {}; }
    client.bannerUrl = client.banner_url || '';
    client.banner = client.banner_url || '';
    client.heroBanner = client.banner_url || '';
    client.coverUrl = client.banner_url || '';
    client.animStyle = client.anim_style || 'confetti';

    // Fetch reels for this specific client
    const reelsQuery = await env.DB.prepare("SELECT * FROM reels WHERE client_id = ? AND hidden = 0 ORDER BY date DESC").bind(client.id).all();

    const reels = (reelsQuery.results || []).map(r => {
      let comments = [];
      try { comments = JSON.parse(r.comments || "[]"); } catch(_) {}
      return {
        id: r.id,
        c: r.client_id,
        clientId: r.client_id,
        type: r.type || 'reel',
        y: Number(r.year || 2026),
        year: Number(r.year || 2026),
        m: Number(r.month != null ? r.month : (r.date ? new Date(r.date).getMonth() : 10)),
        month: Number(r.month != null ? r.month : (r.date ? new Date(r.date).getMonth() : 10)),
        b: r.branch || '',
        branch: r.branch || '',
        album: r.album || '',
        title: r.title,
        date: r.date || '',
        url: r.url,
        fileId: r.file_id || '',
        dur: r.dur || '0:30',
        coverUrl: r.cover_url || '',
        hidden: Boolean(r.hidden),
        status: r.status || 'approved',
        views: Number(r.views || 0),
        downloads: Number(r.downloads || 0),
        comments
      };
    });

    return new Response(JSON.stringify({
      success: true,
      client,
      reels,
      settings,
      env_config
    }), {
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache, no-store, must-revalidate"
      }
    });

  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) {
    return new Response(JSON.stringify({ success: false, error: "Cloudflare D1 database binding missing" }), {
      status: 503,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  try {
    const payload = await request.json();
    const action = payload.action;

    // 1. UPDATE REEL STATUS (Pre-Approval: Approved / Rejected / Pending)
    if (action === "updateReelStatus" || action === "updateStatus") {
      const reelId = payload.reelId || payload.id;
      const status = payload.status;
      if (!reelId || !status) {
        return new Response(JSON.stringify({ success: false, error: "Missing reelId or status" }), { status: 400 });
      }
      await env.DB.prepare("UPDATE reels SET status = ? WHERE id = ?").bind(status, reelId).run();
      return new Response(JSON.stringify({ success: true, message: `Reel status updated to ${status} in Cloudflare D1` }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    // 2. ADD COMMENT / CLIENT FEEDBACK
    if (action === "addComment") {
      const c = payload.comment || payload;
      const reelId = c.reelId || payload.reelId;
      if (!reelId || !c.text) {
        return new Response(JSON.stringify({ success: false, error: "Missing reelId or comment text" }), { status: 400 });
      }

      // Fetch existing comments on reel
      const reelRow = await env.DB.prepare("SELECT comments, client_id FROM reels WHERE id = ?").bind(reelId).first();
      let commentsList = [];
      if (reelRow && reelRow.comments) {
        try { commentsList = JSON.parse(reelRow.comments); } catch(_) {}
      }

      const commentId = c.id || 'cm_' + Date.now().toString(36) + Math.random().toString(36).substring(2, 6);
      const newCommentObj = {
        id: commentId,
        reelId,
        author: c.author || 'Client',
        authorRole: c.authorRole || 'client',
        text: c.text,
        time: c.time || Date.now(),
        dateStr: c.dateStr || new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        replies: c.replies || []
      };

      commentsList.push(newCommentObj);

      await env.DB.prepare("UPDATE reels SET comments = ? WHERE id = ?").bind(JSON.stringify(commentsList), reelId).run();

      // Also persist to comments table for audit log
      try {
        await env.DB.prepare("INSERT INTO comments (id, reel_id, client_id, author, text) VALUES (?, ?, ?, ?, ?)").bind(
          commentId,
          reelId,
          (reelRow && reelRow.client_id) || '',
          newCommentObj.author,
          newCommentObj.text
        ).run();
      } catch(_) {}

      return new Response(JSON.stringify({ success: true, comment: newCommentObj, message: "Comment saved in Cloudflare D1" }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    // 3. MODIFY REEL (Status, Comments, Details)
    if (action === "modifyReel") {
      const r = payload.reel;
      if (!r || !r.id) {
        return new Response(JSON.stringify({ success: false, error: "Missing reel" }), { status: 400 });
      }
      const commentsJson = JSON.stringify(r.comments || []);
      await env.DB.prepare(`
        UPDATE reels 
        SET status = COALESCE(?, status),
            comments = ?,
            views = COALESCE(?, views),
            downloads = COALESCE(?, downloads),
            title = COALESCE(?, title),
            branch = COALESCE(?, branch),
            album = COALESCE(?, album)
        WHERE id = ?
      `).bind(
        r.status || null,
        commentsJson,
        r.views != null ? Number(r.views) : null,
        r.downloads != null ? Number(r.downloads) : null,
        r.title || null,
        r.branch || r.b || null,
        r.album || null,
        r.id
      ).run();

      return new Response(JSON.stringify({ success: true, message: "Reel modified in Cloudflare D1" }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    // 4. SAVE / UPSERT CLIENT (Includes Hero Banner, Store Branch Covers, Album Covers, PIN code)
    if (action === "saveClient") {
      const c = payload.client;
      if (!c || !c.id || !c.name || !c.code) {
        return new Response(JSON.stringify({ success: false, error: "Missing required client fields (id, name, code)" }), { status: 400 });
      }

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

      return new Response(JSON.stringify({ success: true, message: "Client saved to Cloudflare D1" }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    // 5. DELETE CLIENT
    if (action === "deleteClient") {
      const clientId = payload.clientId || payload.id;
      if (!clientId) {
        return new Response(JSON.stringify({ success: false, error: "Missing clientId" }), { status: 400 });
      }
      await env.DB.prepare("DELETE FROM clients WHERE id = ?").bind(clientId).run();
      return new Response(JSON.stringify({ success: true, message: "Client deleted from Cloudflare D1" }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    // 6. SAVE / ADD REEL
    if (action === "saveReel" || action === "addReel") {
      const r = payload.reel;
      const clientId = r.client_id || r.c;
      if (!r || !r.id || !clientId || !r.title || !r.url) {
        return new Response(JSON.stringify({ success: false, error: "Missing required reel fields" }), { status: 400 });
      }
      const commentsJson = JSON.stringify(r.comments || []);
      await env.DB.prepare(`
        INSERT OR REPLACE INTO reels (id, client_id, type, year, month, branch, album, title, date, url, file_id, dur, cover_url, hidden, status, views, downloads, comments)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        r.id,
        clientId,
        r.type || 'reel',
        Number(r.year || r.y || (r.date ? new Date(r.date).getFullYear() : new Date().getFullYear())),
        Number(r.month != null ? r.month : (r.m != null ? r.m : (r.date ? new Date(r.date).getMonth() : new Date().getMonth()))),
        r.branch || r.b || '',
        r.album || '',
        r.title,
        r.date || new Date().toISOString().split('T')[0],
        r.url,
        r.file_id || r.fileId || '',
        r.dur || '0:30',
        r.cover_url || r.coverUrl || '',
        r.hidden ? 1 : 0,
        r.status || 'review',
        Number(r.views || 0),
        Number(r.downloads || 0),
        commentsJson
      ).run();

      return new Response(JSON.stringify({ success: true, message: "Reel saved to Cloudflare D1" }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    // 7. DELETE REEL
    if (action === "deleteReel") {
      const reelId = payload.reelId || payload.id;
      if (!reelId) {
        return new Response(JSON.stringify({ success: false, error: "Missing reelId" }), { status: 400 });
      }
      await env.DB.prepare("DELETE FROM reels WHERE id = ?").bind(reelId).run();
      return new Response(JSON.stringify({ success: true, message: "Reel deleted from Cloudflare D1" }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    // 8. TOGGLE HIDE REEL
    if (action === "toggleHideReel") {
      const reelId = payload.reelId || payload.id;
      if (!reelId) {
        return new Response(JSON.stringify({ success: false, error: "Missing reelId" }), { status: 400 });
      }
      await env.DB.prepare("UPDATE reels SET hidden = CASE WHEN hidden = 1 THEN 0 ELSE 1 END WHERE id = ?").bind(reelId).run();
      return new Response(JSON.stringify({ success: true, message: "Reel visibility toggled in Cloudflare D1" }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    // 9. BATCH UPDATE REELS
    if (action === "batchUpdateReels") {
      const ids = payload.ids;
      const updates = payload.updates || {};
      if (Array.isArray(ids) && ids.length > 0) {
        for (const id of ids) {
          if (updates.status) {
            await env.DB.prepare("UPDATE reels SET status = ? WHERE id = ?").bind(updates.status, id).run();
          }
          if (updates.hidden != null) {
            await env.DB.prepare("UPDATE reels SET hidden = ? WHERE id = ?").bind(updates.hidden ? 1 : 0, id).run();
          }
        }
      }
      return new Response(JSON.stringify({ success: true, message: "Batch updated in Cloudflare D1" }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    // 10. BATCH DELETE REELS
    if (action === "batchDeleteReels") {
      const ids = payload.ids;
      if (Array.isArray(ids) && ids.length > 0) {
        for (const id of ids) {
          await env.DB.prepare("DELETE FROM reels WHERE id = ?").bind(id).run();
        }
      }
      return new Response(JSON.stringify({ success: true, message: "Batch deleted from Cloudflare D1" }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    // 11. SAVE SETTINGS (Branding, Controls, Maintenance, Social Links)
    if (action === "saveSettings") {
      const settings = payload.settings;
      if (!settings || typeof settings !== 'object') {
        return new Response(JSON.stringify({ success: false, error: "Missing settings object" }), { status: 400 });
      }
      for (const [key, val] of Object.entries(settings)) {
        const strVal = typeof val === 'object' ? JSON.stringify(val) : String(val);
        await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)").bind(key, strVal).run();
      }
      return new Response(JSON.stringify({ success: true, message: "Settings saved to Cloudflare D1" }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    // 12. TRACK VIEW / DOWNLOAD EVENT
    if (action === "trackEvent") {
      const reelId = payload.reelId;
      const type = payload.type;
      if (reelId) {
        if (type === 'view') {
          await env.DB.prepare("UPDATE reels SET views = views + 1 WHERE id = ?").bind(reelId).run();
        } else if (type === 'download') {
          await env.DB.prepare("UPDATE reels SET downloads = downloads + 1 WHERE id = ?").bind(reelId).run();
        }
      }
      return new Response(JSON.stringify({ success: true }), {
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
      });
    }

    return new Response(JSON.stringify({ success: false, error: "Unknown action" }), { status: 400 });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
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
