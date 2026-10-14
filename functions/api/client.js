/**
 * Cloudflare Pages Function: /api/client
 * Retrieves or saves client metadata via Cloudflare D1
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
    let client = null;
    if (slug) {
      client = await env.DB.prepare("SELECT * FROM clients WHERE slug = ?").bind(slug.toLowerCase()).first();
    } else if (code) {
      client = await env.DB.prepare("SELECT * FROM clients WHERE code = ?").bind(code).first();
    }

    if (!client) {
      return new Response(JSON.stringify({ success: false, error: "Client not found in D1" }), {
        status: 404,
        headers: { "Content-Type": "application/json" }
      });
    }

    // Parse JSON fields
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
