/**
 * Cloudflare Pages Middleware
 * Intercepts incoming requests to inject dynamic Open Graph / Twitter meta tags,
 * page title, and client-specific favicons for social media crawlers (WhatsApp, Facebook, Twitter, Telegram, etc.)
 * and browser visitors.
 */

export async function onRequest(context) {
  const { request, next, env } = context;
  const url = new URL(request.url);

  // Skip static assets and API routes
  if (url.pathname.startsWith('/api/') || /\.(png|jpe?g|gif|webp|svg|css|js|ico|woff2?|ttf|eot|mp4|webm|json|xml|txt|map)$/i.test(url.pathname)) {
    return next();
  }

  // Get original response from next()
  const response = await next();

  // Only rewrite HTML documents
  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('text/html')) {
    return response;
  }

  // Extract client parameter: ?client=..., ?c=...
  const rawParam = (url.searchParams.get('client') || url.searchParams.get('c') || '').trim();
  const slug = rawParam.toLowerCase();

  // Resolve client information dynamically from D1
  let clientInfo = null;

  if (slug && env.DB) {
    try {
      const row = await env.DB.prepare("SELECT * FROM clients WHERE slug = ? OR id = ?").bind(slug, slug).first();
      if (row) {
        clientInfo = {
          name: row.name,
          slug: row.slug || row.id,
          image: (row.logo && !row.logo.startsWith('data:') ? row.logo : '/Logo/logo.png'),
          desc: `${row.name} · Private Client Delivery Portal`
        };
      }
    } catch (e) {
      // D1 query error fallback
    }
  }

  // Fallback if parameter was provided but not matched in D1
  if (!clientInfo && rawParam) {
    const formattedName = rawParam.replace(/[-_+]/g, ' ').replace(/\b\w/g, ch => ch.toUpperCase());
    clientInfo = {
      name: formattedName,
      slug: slug,
      image: '/Logo/logo.png',
      desc: `${formattedName} · Private Client Delivery Portal`
    };
  }

  // Formatted metadata
  const siteName = 'DAY NIGHT';
  let title, description, imageUrl, faviconUrl;

  if (clientInfo) {
    title = `${clientInfo.name} | DAY NIGHT`;
    description = `${clientInfo.desc} | Day Night Media`;
    faviconUrl = clientInfo.image;
    imageUrl = clientInfo.image.startsWith('http') ? clientInfo.image : `${url.origin}${clientInfo.image}`;
  } else {
    title = 'Day Night Media | DAY NIGHT';
    description = 'Day Night Media - Production Company & Private Client Delivery Portal';
    faviconUrl = '/Logo/logo.png';
    imageUrl = `${url.origin}/Logo/logo.png`;
  }

  const currentUrl = url.href;

  // Use Cloudflare HTMLRewriter to stream-modify the response
  return new HTMLRewriter()
    .on('title', {
      element(el) {
        el.setInnerContent(title);
      }
    })
    .on('meta[name="title"]', {
      element(el) {
        el.setAttribute('content', title);
      }
    })
    .on('meta[name="description"]', {
      element(el) {
        el.setAttribute('content', description);
      }
    })
    .on('link[id="dynamic-favicon"]', {
      element(el) {
        el.setAttribute('href', faviconUrl);
      }
    })
    .on('link[rel="icon"]', {
      element(el) {
        el.setAttribute('href', faviconUrl);
      }
    })
    .on('link[id="dynamic-apple-icon"]', {
      element(el) {
        el.setAttribute('href', faviconUrl);
      }
    })
    .on('link[rel="apple-touch-icon"]', {
      element(el) {
        el.setAttribute('href', faviconUrl);
      }
    })
    .on('meta[property="og:title"]', {
      element(el) {
        el.setAttribute('content', title);
      }
    })
    .on('meta[property="og:description"]', {
      element(el) {
        el.setAttribute('content', description);
      }
    })
    .on('meta[property="og:image"]', {
      element(el) {
        el.setAttribute('content', imageUrl);
      }
    })
    .on('meta[property="og:image:secure_url"]', {
      element(el) {
        el.setAttribute('content', imageUrl);
      }
    })
    .on('meta[property="og:url"]', {
      element(el) {
        el.setAttribute('content', currentUrl);
      }
    })
    .on('meta[property="og:site_name"]', {
      element(el) {
        el.setAttribute('content', siteName);
      }
    })
    .on('meta[name="twitter:title"]', {
      element(el) {
        el.setAttribute('content', title);
      }
    })
    .on('meta[name="twitter:description"]', {
      element(el) {
        el.setAttribute('content', description);
      }
    })
    .on('meta[name="twitter:image"]', {
      element(el) {
        el.setAttribute('content', imageUrl);
      }
    })
    .transform(response);
}
