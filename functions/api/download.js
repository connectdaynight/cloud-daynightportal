/**
 * Cloudflare Pages Function: /api/download?id={fileId}&name={filename}&url={directUrl}
 * Directly streams the MP4 video file with Content-Disposition: attachment
 * Forces native browser download on the current tab without opening Google Drive or new tabs.
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
        tokenExpiry = now + 45 * 60 * 1000;
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
  const customName = url.searchParams.get('name') || 'video.mp4';
  const directUrl = url.searchParams.get('url');
  const gasUrl = url.searchParams.get('gas') || env?.GAS_URL || DEFAULT_GAS_URL;

  const cleanFilename = customName.replace(/[^a-zA-Z0-9_\-\.\s]/g, '').trim() || 'video.mp4';

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

      if (!videoStream) {
        const initialUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download`;
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
          }
        }
      }
    } else if (directUrl) {
      videoStream = await fetch(directUrl, { headers: fetchHeaders });
    }

    if (!videoStream || (!videoStream.ok && videoStream.status !== 206)) {
      return new Response(`Unable to download file (status ${videoStream ? videoStream.status : 'error'})`, {
        status: videoStream ? videoStream.status : 502,
        headers: { "Content-Type": "text/plain" }
      });
    }

    const responseHeaders = new Headers();
    let contentType = "video/mp4";
    if (/\.jpe?g$/i.test(cleanFilename)) contentType = "image/jpeg";
    else if (/\.png$/i.test(cleanFilename)) contentType = "image/png";
    else if (/\.webp$/i.test(cleanFilename)) contentType = "image/webp";
    else if (/\.mov$/i.test(cleanFilename)) contentType = "video/quicktime";
    else if (/\.mp4$/i.test(cleanFilename)) contentType = "video/mp4";
    else {
      const incoming = videoStream.headers.get("Content-Type") || "";
      if (incoming.includes("image/")) contentType = incoming;
      else contentType = "video/mp4";
    }

    const safeFilename = cleanFilename.replace(/["\r\n\\]/g, '').trim() || (contentType.startsWith('image/') ? 'image.jpg' : 'video.mp4');
    const encodedFilename = encodeURIComponent(safeFilename);
    const nowUtc = new Date().toUTCString();

    responseHeaders.set("Content-Type", contentType);
    responseHeaders.set("Content-Disposition", `attachment; filename="${safeFilename}"; filename*=UTF-8''${encodedFilename}`);
    responseHeaders.set("X-Content-Type-Options", "nosniff");
    responseHeaders.set("Last-Modified", nowUtc);
    responseHeaders.set("Date", nowUtc);
    responseHeaders.set("Accept-Ranges", "bytes");
    responseHeaders.set("Access-Control-Allow-Origin", "*");
    if (videoStream.headers.has("Content-Length")) {
      responseHeaders.set("Content-Length", videoStream.headers.get("Content-Length"));
    }
    if (videoStream.headers.has("Content-Range")) {
      responseHeaders.set("Content-Range", videoStream.headers.get("Content-Range"));
    }
    responseHeaders.set("Cache-Control", "no-cache, no-store, must-revalidate");

    return new Response(videoStream.body, {
      status: videoStream.status,
      statusText: videoStream.statusText,
      headers: responseHeaders
    });
  } catch (err) {
    return new Response("Direct download error: " + err.message, {
      status: 500,
      headers: { "Content-Type": "text/plain" }
    });
  }
}
