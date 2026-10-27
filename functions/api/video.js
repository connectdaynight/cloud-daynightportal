/**
 * Cloudflare Pages Function: /api/video?id={fileId}&url={directUrl}
 * Streams original uncompressed Google Drive MP4 video with full master resolution & byte-range seeking.
 * Uses authenticated Google Drive API v3 (via Google Apps Script OAuth token) with graceful public fallback.
 */

const DEFAULT_GAS_URL = "https://script.google.com/macros/s/AKfycbxBnjSi9NgCq03C686w_TROt60U29-fbMXOVWCES4aDBvPwgddy3r3Z__i98Hx1GCCB/exec";

let cachedToken = null;
let tokenExpiry = 0;

async function getStreamToken(gasUrl) {
  const now = Date.now();
  if (cachedToken && now < tokenExpiry) {
    return cachedToken;
  }
  try {
    const res = await fetch(`${gasUrl}?action=getStreamToken`, { redirect: "follow" });
    if (res.ok) {
      const data = await res.json();
      if (data && data.success && data.token) {
        cachedToken = data.token;
        tokenExpiry = now + 45 * 60 * 1000; // Cache 45 mins
        return cachedToken;
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
      // 1. Primary: Authenticated Google Drive API v3 stream
      const token = await getStreamToken(gasUrl);
      if (token) {
        const driveApiUrl = `https://www.googleapis.com/drive/v3/files/${encodeURIComponent(fileId)}?alt=media`;
        const apiHeaders = {
          "Authorization": `Bearer ${token}`,
          ...fetchHeaders
        };
        const apiRes = await fetch(driveApiUrl, { headers: apiHeaders });
        const apiContentType = apiRes.headers.get("content-type") || "";

        if ((apiRes.ok || apiRes.status === 206) && !apiContentType.includes("text/html")) {
          videoStream = apiRes;
        }
      }

      // 2. Secondary Fallback: Direct Google Drive usercontent download endpoint
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

    if (!videoStream || !videoStream.ok && videoStream.status !== 206) {
      return new Response(`Unable to stream video (status ${videoStream ? videoStream.status : 'error'})`, {
        status: videoStream ? videoStream.status : 502,
        headers: { "Content-Type": "text/plain" }
      });
    }

    const contentType = videoStream.headers.get("Content-Type") || "";
    if (contentType.includes("text/html")) {
      return new Response("Upstream returned HTML (Google Drive quota exceeded on public link)", {
        status: 502,
        headers: { "Content-Type": "text/plain" }
      });
    }

    const responseHeaders = new Headers();
    responseHeaders.set("Content-Type", contentType || "video/mp4");
    responseHeaders.set("Content-Disposition", "inline");
    responseHeaders.set("Accept-Ranges", "bytes");
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    if (videoStream.headers.has("Content-Length")) {
      responseHeaders.set("Content-Length", videoStream.headers.get("Content-Length"));
    }
    if (videoStream.headers.has("Content-Range")) {
      responseHeaders.set("Content-Range", videoStream.headers.get("Content-Range"));
    }
    responseHeaders.set("Cache-Control", "public, max-age=3600");

    return new Response(videoStream.body, {
      status: videoStream.status,
      statusText: videoStream.statusText,
      headers: responseHeaders
    });
  } catch (err) {
    return new Response("Video streaming error: " + err.message, {
      status: 500,
      headers: { "Content-Type": "text/plain" }
    });
  }
}

export const onRequestHead = onRequestGet;
