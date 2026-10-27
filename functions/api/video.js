/**
 * Cloudflare Pages Function: /api/video?id={fileId}&url={directUrl}
 * Streams original uncompressed Google Drive MP4 video with full master resolution & byte-range seeking
 */
function getCleanCookies(res) {
  let rawCookies = [];
  if (typeof res.headers.getSetCookie === 'function') {
    rawCookies = res.headers.getSetCookie();
  } else {
    const sc = res.headers.get("set-cookie");
    if (sc) rawCookies = [sc];
  }
  return rawCookies
    .map(c => c.split(';')[0].trim())
    .filter(c => c && c.includes('='))
    .join('; ');
}

export async function onRequestGet(context) {
  const { request } = context;
  const url = new URL(request.url);
  const fileId = url.searchParams.get('id');
  const directUrl = url.searchParams.get('url');

  if (!fileId && !directUrl) {
    return new Response("Missing video file ID or URL parameter", { status: 400 });
  }

  try {
    let videoStream = null;
    const baseHeaders = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    };

    const rangeHeader = request.headers.get("Range");

    if (fileId) {
      // 1. Initial request to Google Drive download URL (with export=download)
      const initialUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
      const res1 = await fetch(initialUrl, {
        headers: baseHeaders,
        redirect: "manual"
      });

      const cookie1 = getCleanCookies(res1);
      const loc1 = res1.headers.get("location");
      const targetUrl = loc1 || `https://drive.usercontent.google.com/download?id=${fileId}&export=download`;

      const headers2 = { ...baseHeaders };
      if (cookie1) headers2["Cookie"] = cookie1;

      // 2. Fetch the target download confirmation form URL
      const res2 = await fetch(targetUrl, {
        headers: headers2,
        redirect: "manual"
      });

      const contentType2 = res2.headers.get("content-type") || "";
      const cookie2 = getCleanCookies(res2);
      const combinedCookies = [cookie1, cookie2].filter(Boolean).join("; ");

      if (contentType2.includes("video") || contentType2.includes("application/octet-stream")) {
        videoStream = res2;
      } else {
        // 3. Google Drive large-file confirmation form: parse form parameters including uuid
        const text = await res2.text();
        const formMatch = text.match(/<form[^>]*action="([^"]+)"[^>]*>([\s\S]*?)<\/form>/i);
        let submitUrl = '';

        if (formMatch) {
          const action = formMatch[1];
          const inputs = [...formMatch[2].matchAll(/name="([^"]+)"\s+value="([^"]*)"/g)];
          const params = new URLSearchParams();
          inputs.forEach(x => params.append(x[1], x[2]));
          if (!params.has("confirm")) params.append("confirm", "t");
          submitUrl = action + "?" + params.toString();
        } else {
          const confirmCode = (text.match(/confirm=([0-9A-Za-z_-]+)/i) || [])[1] || 't';
          const uuid = (text.match(/name="uuid"\s+value="([^"]+)"/i) || [])[1] || '';
          submitUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=${confirmCode}${uuid ? '&uuid=' + uuid : ''}`;
        }

        const headers3 = { ...baseHeaders };
        if (rangeHeader) headers3["Range"] = rangeHeader;
        if (combinedCookies) headers3["Cookie"] = combinedCookies;

        videoStream = await fetch(submitUrl, { headers: headers3 });
      }
    } else if (directUrl) {
      const headersDirect = { ...baseHeaders };
      if (rangeHeader) headersDirect["Range"] = rangeHeader;
      videoStream = await fetch(directUrl, { headers: headersDirect });
    }

    if (!videoStream || !videoStream.ok) {
      return new Response(`Unable to stream video (status ${videoStream ? videoStream.status : 'error'})`, {
        status: videoStream ? videoStream.status : 502,
        headers: { "Content-Type": "text/plain" }
      });
    }

    const contentType = videoStream.headers.get("Content-Type") || "";
    if (contentType.includes("text/html")) {
      return new Response("Upstream returned HTML error page (Google Drive quota exceeded or confirmation required)", {
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
    responseHeaders.set("Cache-Control", "public, max-age=86400");

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
