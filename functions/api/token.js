/**
 * Cloudflare Pages Function: /api/token
 * Edge-cached OAuth token endpoint for high-speed video streaming.
 * Caches token for 30 minutes at Cloudflare Edge so clients and workers have 0ms latency.
 */

const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycbxTaYOdXlJ8Sy-yfbh68gq4iJn1ThlQXoTY83Bc75tlPYcQrbz1lv_WWfDySu4CYaGE/exec";

let memoryToken = null;
let memoryExpiry = 0;

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const gasUrl = url.searchParams.get('gas') || env?.GAS_URL || DEFAULT_GAS_URL;

  const now = Date.now();
  if (memoryToken && now < memoryExpiry) {
    return new Response(JSON.stringify({ success: true, token: memoryToken, cached: true }), {
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=1800, s-maxage=1800",
        "Access-Control-Allow-Origin": "*"
      }
    });
  }

  try {
    const res = await fetch(`${gasUrl}?action=getStreamToken`, { redirect: "follow" });
    if (res.ok) {
      const data = await res.json();
      if (data && data.success && data.token) {
        memoryToken = data.token;
        memoryExpiry = now + 40 * 60 * 1000;
        return new Response(JSON.stringify({ success: true, token: data.token }), {
          headers: {
            "Content-Type": "application/json",
            "Cache-Control": "public, max-age=1800, s-maxage=1800",
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
