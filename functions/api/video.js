/**
 * Cloudflare Pages Function: /api/video?id={fileId}&url={directUrl}
 * Streams original uncompressed Google Drive MP4 video with full master resolution & byte-range seeking
 */
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
    const fetchHeaders = {
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
    };
    const rangeHeader = request.headers.get("Range");
    if (rangeHeader) {
      fetchHeaders["Range"] = rangeHeader;
    }

    let debugLog = {};
    if (fileId) {
      // 1. Initial request to Google Drive download URL (with export=download)
      const initialUrl = `https://drive.google.com/uc?export=download&id=${fileId}`;
      const res1 = await fetch(initialUrl, {
        headers: fetchHeaders,
        redirect: "manual"
      });

      const cookie1 = res1.headers.get("set-cookie") || "";
      const loc1 = res1.headers.get("location");
      const targetUrl = loc1 || `https://drive.usercontent.google.com/download?id=${fileId}&export=download`;
      debugLog.step1 = { status: res1.status, loc: loc1, cookie: cookie1 };

      const headers2 = { ...fetchHeaders };
      if (cookie1) headers2["Cookie"] = cookie1;

      // 2. Fetch the target download URL
      const res2 = await fetch(targetUrl, {
        headers: headers2,
        redirect: "manual"
      });

      const contentType2 = res2.headers.get("content-type") || "";
      const cookie2 = res2.headers.get("set-cookie") || "";
      const combinedCookies = [cookie1, cookie2].filter(Boolean).join("; ");
      debugLog.step2 = { status: res2.status, contentType: contentType2, cookie: cookie2 };

      if (contentType2.includes("video") || contentType2.includes("application/octet-stream")) {
        videoStream = res2;
      } else {
        // 3. Google Drive large-file confirmation form: parse form parameters including uuid
        const text = await res2.text();
        debugLog.step2Text = text.slice(0, 300);
        const formMatch = text.match(/<form[^>]*action="([^"]+)"[^>]*>([\s\S]*?)<\/form>/i);
        if (formMatch) {
          const action = formMatch[1];
          const inputs = [...formMatch[2].matchAll(/name="([^"]+)"\s+value="([^"]*)"/g)];
          const params = new URLSearchParams();
          inputs.forEach(x => params.append(x[1], x[2]));
          if (!params.has("confirm")) params.append("confirm", "t");
          const submitUrl = action + "?" + params.toString();
          debugLog.step3Url = submitUrl;

          const headers3 = { ...fetchHeaders };
          if (combinedCookies) headers3["Cookie"] = combinedCookies;
          videoStream = await fetch(submitUrl, { headers: headers3 });
          debugLog.step3 = { status: videoStream.status, contentType: videoStream.headers.get("content-type") };
        } else {
          const confirmCode = (text.match(/confirm=([0-9A-Za-z_-]+)/i) || [])[1] || 't';
          const uuid = (text.match(/name="uuid"\s+value="([^"]+)"/i) || [])[1] || '';
          let submitUrl = `https://drive.usercontent.google.com/download?id=${fileId}&export=download&confirm=${confirmCode}${uuid ? '&uuid=' + uuid : ''}`;
          debugLog.step3Url = submitUrl;
          const headers3 = { ...fetchHeaders };
          if (combinedCookies) headers3["Cookie"] = combinedCookies;
          videoStream = await fetch(submitUrl, { headers: headers3 });
          debugLog.step3 = { status: videoStream.status, contentType: videoStream.headers.get("content-type") };
        }
      }
    } else if (directUrl) {
      videoStream = await fetch(directUrl, { headers: fetchHeaders });
    }

    if (url.searchParams.get("debug") === "1") {
      return new Response(JSON.stringify(debugLog, null, 2), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
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
