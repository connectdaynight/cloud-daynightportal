/**
 * Cloudflare Pages Function: /api/token
 * Edge-cached 24-Hour OAuth token endpoint for high-speed video streaming.
 * Caches token for 24 hours across D1, Edge Cache, and Memory so all requests have 0ms latency.
 */

const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycbxTaYOdXlJ8Sy-yfbh68gq4iJn1ThlQXoTY83Bc75tlPYcQrbz1lv_WWfDySu4CYaGE/exec";
const ONE_DAY_MS = 24 * 60 * 60 * 1000;

let memoryToken = null;
let memoryExpiry = 0;

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const gasUrl = url.searchParams.get('gas') || env?.GAS_URL || DEFAULT_GAS_URL;
  const forceRefresh = url.searchParams.get('refresh') === '1' || url.searchParams.get('refresh') === 'true';

  const now = Date.now();
  if (!forceRefresh && memoryToken && now < memoryExpiry) {
    return new Response(JSON.stringify({ success: true, token: memoryToken, cached: true }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=86400, s-maxage=86400",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }

  // 1. Check Cloudflare D1 Database Persistent Settings
  if (!forceRefresh && env && env.DB) {
    try {
      const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'google_stream_token'").first();
      if (row && row.value) {
        const parsed = JSON.parse(row.value);
        if (parsed.token && (now - (parsed.savedAt || 0)) < ONE_DAY_MS) {
          memoryToken = parsed.token;
          memoryExpiry = (parsed.savedAt || now) + ONE_DAY_MS;
          return new Response(JSON.stringify({ success: true, token: memoryToken, cached: true, source: "d1" }), {
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=86400, s-maxage=86400",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }
      }
    } catch (_) {}
  }

  // 2. Check Edge Cache
  const cacheReq = new Request(`${url.origin}/__internal_edge_token_v3__`);
  if (!forceRefresh) {
    try {
      const cache = caches.default;
      const cached = await cache.match(cacheReq);
      if (cached) {
        const data = await cached.json();
        if (data && data.token && (now - (data.savedAt || 0)) < ONE_DAY_MS) {
          memoryToken = data.token;
          memoryExpiry = (data.savedAt || now) + ONE_DAY_MS;
          return new Response(JSON.stringify({ success: true, token: memoryToken, cached: true, source: "edge" }), {
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=86400, s-maxage=86400",
              "Access-Control-Allow-Origin": "*"
            }
          });
        }
      }
    } catch (_) {}
  }

  // 3. Fetch Fresh Token from Apps Script
  try {
    const res = await fetch(`${gasUrl}?action=getStreamToken`, { redirect: "follow" });
    if (res.ok) {
      const data = await res.json();
      if (data && data.success && data.token) {
        memoryToken = data.token;
        memoryExpiry = now + ONE_DAY_MS;

        // Persist token in Cloudflare D1 for 24 hours
        if (env && env.DB) {
          try {
            await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('google_stream_token', ?)").bind(
              JSON.stringify({ token: data.token, savedAt: now })
            ).run();
          } catch (_) {}
        }

        // Persist token in Edge Cache for 24 hours
        try {
          const cache = caches.default;
          await cache.put(cacheReq, new Response(JSON.stringify({ token: data.token, savedAt: now }), {
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=86400"
            }
          }));
        } catch (_) {}

        return new Response(JSON.stringify({ success: true, token: data.token, cached: false }), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=86400, s-maxage=86400",
            "Access-Control-Allow-Origin": "*"
          }
        });
      }
    }
  } catch (err) {
    return new Response(JSON.stringify({ success: false, error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
    });
  }

  return new Response(JSON.stringify({ success: false, error: "Failed to retrieve token" }), {
    status: 502,
    headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  });
}
