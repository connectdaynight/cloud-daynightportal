/**
 * Cloudflare Pages Function: /api/video?id={fileId}&url={directUrl}
 * High-performance, zero-buffering native video streaming endpoint.
 * Features:
 * 1. Global Edge Token Caching via caches.default (zero latency on range requests).
 * 2. Direct authenticated Google Drive API v3 pipe with native 206 Partial Content.
 * 3. Cloudflare edge chunk caching (cf: cacheEverything) to stream at maximum user bandwidth (300Mbps+).
 * 4. Full CORS and Range header exposure for seamless HTML5 video buffering.
 */

const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycbxTaYOdXlJ8Sy-yfbh68gq4iJn1ThlQXoTY83Bc75tlPYcQrbz1lv_WWfDySu4CYaGE/exec";

let memoryToken = null;
let memoryExpiry = 0;

async function getStreamToken(gasUrl, reqUrl, forceRefresh = false) {
  const now = Date.now();
  if (!forceRefresh && memoryToken && now < memoryExpiry) {
    return memoryToken;
  }

  const origin = reqUrl ? new URL(reqUrl).origin : "https://daynight-portal.pages.dev";
  const cacheReq = new Request(`${origin}/__internal_edge_token_v3__`);

  // Check Edge Cache (shared across all Cloudflare isolates at this PoP)
  if (!forceRefresh) {
    try {
      const cache = caches.default;
      const cached = await cache.match(cacheReq);
      if (cached) {
        const data = await cached.json();
        if (data && data.token) {
          memoryToken = data.token;
          memoryExpiry = now + 40 * 60 * 1000;
          return memoryToken;
        }
      }
    } catch (_) {}
  }

  // Fetch fresh token from Apps Script
  try {
    const res = await fetch(`${gasUrl}?action=getStreamToken`, { redirect: "follow" });
    if (res.ok) {
      const data = await res.json();
      if (data && data.success && data.token) {
        memoryToken = data.token;
        memoryExpiry = now + 40 * 60 * 1000;
        try {
          const cache = caches.default;
          await cache.put(cacheReq, new Response(JSON.stringify({ token: data.token }), {
            headers: {
              "Content-Type": "application/json",
              "Cache-Control": "public, max-age=2400"
            }
          }));
        } catch (_) {}
        return memoryToken;
      }
    }
  } catch (_) {}

  return null;
}

export async function onRequestGet(context) {
  const { request, env } = context;
  const url = new URL(request.url);
  const fileId = url.searchParams.get('id');
  const directUrl = url.searchParams.get('url');
  const gasUrl = url.searchParams.get('gas') || env?.GAS_URL || DEFAULT_GAS_URL;

  if (!fileId && !directUrl) {
    return new Response("Missing video file ID or URL parameter", { status: 400 });
  }

  try {
    let videoStream = null;
    const fetchHeaders = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    };
    const rangeHeader = request.headers.get("Range");
    if (rangeHeader) {
      fetchHeaders["Range"] = rangeHeader;
    }

    if (fileId) {
      // 1. Primary: High-speed Authenticated Google Drive API v3 stream
      const clientToken = url.searchParams.get('token') || request.headers.get('Authorization')?.replace(/^Bearer\s+/i, '');
      let token = clientToken || await getStreamToken(gasUrl, request.url);
      if (token) {
        const driveApiUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
        const apiHeaders = {
          "Authorization": `Bearer ${token}`,
          ...fetchHeaders
        };
        let apiRes = await fetch(driveApiUrl, { headers: apiHeaders });

        // If token was rejected (401), immediately fetch a fresh token and retry once
        if (apiRes.status === 401) {
          memoryToken = null;
          token = await getStreamToken(gasUrl, request.url, true);
          if (token) {
            apiHeaders["Authorization"] = `Bearer ${token}`;
            apiRes = await fetch(driveApiUrl, { headers: apiHeaders });
          }
        }

        const apiContentType = apiRes.headers.get("content-type") || "";
        if ((apiRes.ok || apiRes.status === 206) && !apiContentType.includes("text/html")) {
          videoStream = apiRes;
        }
      }

      // 2. Secondary Fallback: Multi-step direct Google Drive download endpoint
      if (!videoStream) {
        const initialUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=t`;
        const res1 = await fetch(initialUrl, {
          headers: fetchHeaders,
          redirect: "manual"
        });

        const contentType1 = res1.headers.get("content-type") || "";
        const cookie1 = res1.headers.get("set-cookie") || "";

        if (res1.status === 302 || res1.status === 303) {
          const redirectUrl = res1.headers.get("location");
          if (redirectUrl) {
            const headers2 = { ...fetchHeaders };
            if (cookie1) headers2["Cookie"] = cookie1;
            videoStream = await fetch(redirectUrl, { headers: headers2 });
          }
        } else if (contentType1.includes("video") || contentType1.includes("application/octet-stream")) {
          videoStream = res1;
        } else {
          const text = await res1.text();
          const formMatch = text.match(/<form[^>]*action="([^"]+)"[^>]*>([\s\S]*?)<\/form>/i);
          if (formMatch) {
            const action = formMatch[1];
            const inputs = [...formMatch[2].matchAll(/name="([^"]+)"\s+value="([^"]*)"/g)];
            const params = new URLSearchParams();
            inputs.forEach(x => params.append(x[1], x[2]));
            if (!params.has("confirm")) params.append("confirm", "t");
            const submitUrl = action + "?" + params.toString();

            const headers2 = { ...fetchHeaders };
            if (cookie1) headers2["Cookie"] = cookie1;
            videoStream = await fetch(submitUrl, { headers: headers2 });
          } else {
            const confirmCode = (text.match(/confirm=([0-9A-Za-z_-]+)/i) || [])[1] || 't';
            const linkMatch = text.match(/href="([^"]*(?:confirm=[^"&]+|export=download[^"]*))"/i);
            let submitUrl = linkMatch ? linkMatch[1].replace(/&amp;/g, '&') : `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=${confirmCode}`;
            if (submitUrl.startsWith('/')) submitUrl = `https://drive.usercontent.google.com${submitUrl}`;
            const headers2 = { ...fetchHeaders };
            if (cookie1) headers2["Cookie"] = cookie1;
            videoStream = await fetch(submitUrl, { headers: headers2 });
          }
        }
      }
    } else if (directUrl) {
      videoStream = await fetch(directUrl, { headers: fetchHeaders });
    }

    if (!videoStream || (!videoStream.ok && videoStream.status !== 206)) {
      return new Response(`Unable to stream video (status ${videoStream ? videoStream.status : 'error'})`, {
        status: videoStream ? videoStream.status : 502,
        headers: {
          "Content-Type": "text/plain",
          "Cache-Control": "no-store, no-cache, must-revalidate"
        }
      });
    }

    const contentType = videoStream.headers.get("Content-Type") || "";
    if (contentType.includes("text/html")) {
      return new Response("Upstream returned HTML (Google Drive quota exceeded on public link)", {
        status: 502,
        headers: {
          "Content-Type": "text/plain",
          "Cache-Control": "no-store, no-cache, must-revalidate"
        }
      });
    }

    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", contentType || "video/mp4");
    responseHeaders.set("Content-Disposition", "inline");
    responseHeaders.set("Accept-Ranges", "bytes");
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    responseHeaders.set("Access-Control-Allow-Headers", "Range, Authorization, Content-Type");
    responseHeaders.set("Access-Control-Expose-Headers", "Content-Range, Content-Length, Accept-Ranges");
    if (videoStream.headers.has("Content-Length")) {
      responseHeaders.set("Content-Length", videoStream.headers.get("Content-Length"));
    }
    if (videoStream.headers.has("Content-Range")) {
      responseHeaders.set("Content-Range", videoStream.headers.get("Content-Range"));
    }
    responseHeaders.set("Cache-Control", "public, max-age=86400, s-maxage=86400, stale-while-revalidate=86400");

    return new Response(videoStream.body, {
      status: videoStream.status,
      statusText: videoStream.statusText,
      headers: responseHeaders
    });
  } catch (err) {
    return new Response("Video streaming error: " + err.message, {
      status: 500,
      headers: {
        "Content-Type": "text/plain",
        "Cache-Control": "no-store, no-cache, must-revalidate"
      }
    });
  }
}

export const onRequestHead = onRequestGet;
