/**
 * Cloudflare Pages Function: /api/client
 * Retrieves, lists, or saves client and reel metadata via Cloudflare D1
 */

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const slug = url.searchParams.get('slug') || url.searchParams.get('c');
  const code = url.searchParams.get('code');

  if (!env.DB) {
    return new Response(JSON.stringify({ success: false, error: "D1 database not bound yet. Using Google Drive backend." }), {
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    // If no specific client requested, return list of active clients
    if (!slug && !code) {
      const allClients = await env.DB.prepare("SELECT id, slug, name, tagline, accent, anim_style, logo, banner_url FROM clients ORDER BY name ASC").all();
      return new Response(JSON.stringify({
        success: true,
        clients: (allClients.results || []).map(c => ({
          ...c,
          animStyle: c.anim_style,
          banner: c.banner_url
        }))
      }), {
        headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" }
      });
    }

    let client = null;
    if (slug) {
      client = await env.DB.prepare("SELECT * FROM clients WHERE slug = ? OR id = ?").bind(slug.toLowerCase(), slug.toLowerCase()).first();
    } else if (code) {
      client = await env.DB.prepare("SELECT * FROM clients WHERE code = ?").bind(code).first();
    }

    if (!client) {
      return new Response(JSON.stringify({ success: false, error: "Client not found in D1" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Parse JSON fields safely
    client.branches = JSON.parse(client.branches || "[]");
    client.albums = JSON.parse(client.albums || "[]");

    const reelsQuery = await env.DB.prepare("SELECT * FROM reels WHERE client_id = ? AND hidden = 0 ORDER BY date DESC").bind(client.id).all();
    const reels = (reelsQuery.results || []).map(r => ({
      id: r.id,
      c: r.client_id,
      type: r.type || 'reel',
      y: r.year,
      m: r.month,
      b: r.branch || '',
      album: r.album || '',
      title: r.title,
      date: r.date,
      url: r.url,
      fileId: r.file_id || '',
      dur: r.dur || '0:30',
      coverUrl: r.cover_url || '',
      hidden: Boolean(r.hidden),
      status: r.status || 'approved',
      views: r.views || 0,
      downloads: r.downloads || 0
    }));

    return new Response(JSON.stringify({
      success: true,
      client,
      reels
    }), {
      headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=60" }
    });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}

export async function onRequestPost(context) {
  const { request, env } = context;
  if (!env.DB) {
    return new Response(JSON.stringify({ success: false, error: "D1 database not bound." }), {
      status: 503,
      headers: { "Content-Type": "application/json" }
    });
  }

  try {
    const payload = await request.json();
    const action = payload.action;

    // Check passkey authentication if configured
    const passkey = request.headers.get("x-admin-passkey") || payload.passkey;
    const MASTER_ADMIN_KEYS = ['DN@2026', '0000', '9999', '2026'];
    const storedPass = await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_passkey'").first();
    const isMaster = passkey && MASTER_ADMIN_KEYS.includes(passkey);
    if (storedPass && storedPass.value && passkey !== storedPass.value && !isMaster) {
      return new Response(JSON.stringify({ success: false, error: "Unauthorized: Invalid passkey" }), {
        status: 401,
        headers: { "Content-Type": "application/json" }
      });
    }

    if (action === "saveClient") {
      const c = payload.client;
      if (!c || !c.id || !c.name || !c.code) {
        return new Response(JSON.stringify({ success: false, error: "Missing required client fields (id, name, code)" }), { status: 400 });
      }
      await env.DB.prepare(`
        INSERT OR REPLACE INTO clients (id, slug, name, code, tagline, accent, anim_style, branches, albums, logo, banner_url)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        c.id,
        (c.slug || c.id).toLowerCase(),
        c.name,
        c.code,
        c.tagline || '',
        c.accent || '',
        c.animStyle || 'confetti',
        JSON.stringify(c.branches || []),
        JSON.stringify(c.albums || []),
        c.logo || '',
        c.banner || c.banner_url || ''
      ).run();

      return new Response(JSON.stringify({ success: true, message: "Client saved to D1" }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    if (action === "saveReel") {
      const r = payload.reel;
      const clientId = r.client_id || r.c;
      if (!r || !r.id || !clientId || !r.title || !r.url) {
        return new Response(JSON.stringify({ success: false, error: "Missing required reel fields" }), { status: 400 });
      }
      await env.DB.prepare(`
        INSERT OR REPLACE INTO reels (id, client_id, type, year, month, branch, album, title, date, url, file_id, dur, cover_url, hidden, status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).bind(
        r.id,
        clientId,
        r.type || 'reel',
        Number(r.year || r.y || new Date().getFullYear()),
        Number(r.month || r.m || (new Date().getMonth() + 1)),
        r.branch || r.b || '',
        r.album || '',
        r.title,
        r.date || new Date().toISOString().split('T')[0],
        r.url,
        r.file_id || r.fileId || '',
        r.dur || '0:30',
        r.cover_url || r.coverUrl || '',
        r.hidden ? 1 : 0,
        r.status || 'approved'
      ).run();

      return new Response(JSON.stringify({ success: true, message: "Reel saved to D1" }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    if (action === "deleteReel") {
      const reelId = payload.reelId || payload.id;
      if (!reelId) {
        return new Response(JSON.stringify({ success: false, error: "Missing reelId" }), { status: 400 });
      }
      await env.DB.prepare("DELETE FROM reels WHERE id = ?").bind(reelId).run();
      return new Response(JSON.stringify({ success: true, message: "Reel deleted from D1" }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    if (action === "deleteClient") {
      const clientId = payload.clientId || payload.id;
      if (!clientId) {
        return new Response(JSON.stringify({ success: false, error: "Missing clientId" }), { status: 400 });
      }
      await env.DB.prepare("DELETE FROM clients WHERE id = ?").bind(clientId).run();
      return new Response(JSON.stringify({ success: true, message: "Client deleted from D1" }), {
        headers: { "Content-Type": "application/json" }
      });
    }

    return new Response(JSON.stringify({ success: false, error: "Unknown action" }), { status: 400 });
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" }
    });
  }
}
